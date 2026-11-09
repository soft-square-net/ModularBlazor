using System.Collections.Immutable;
using System.IO.Compression;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Xml.Linq;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;

/// <summary>Reads module files with System.Reflection.Metadata: types and attributes are read as data, nothing is loaded or run.</summary>
internal sealed class ModuleInspector : IModuleInspector
{
    private const string ClientAttribute = "soft.square.net.ModularBlazor.Abstractions.ClientModuleAttribute";
    private const string HostAttribute = "soft.square.net.ModularBlazor.Abstractions.HostModuleAttribute";
    private const string LayoutKeyAttribute = "soft.square.net.ModularBlazor.Abstractions.LayoutKeyAttribute";
    private const string UseLayoutAttribute = "soft.square.net.ModularBlazor.Abstractions.UseLayoutAttribute";
    private const string RouteAttribute = "Microsoft.AspNetCore.Components.RouteAttribute";
    private const string AuthorizeAttribute = "Microsoft.AspNetCore.Authorization.AuthorizeAttribute";
    private const string HostModuleInterface = "soft.square.net.ModularBlazor.Infrastructure.Modules.IHostModule";

    public ModuleInspection Inspect(Stream content, string fileName)
    {
        using var memory = new MemoryStream();
        content.CopyTo(memory);
        memory.Position = 0;

        string? title = null;
        if (fileName.EndsWith(".nupkg", StringComparison.OrdinalIgnoreCase))
        {
            (var dll, title) = ReadPackage(memory);
            return InspectAssembly(dll, title);
        }

        return InspectAssembly(memory.ToArray(), null);
    }

    // The main assembly of a NuGet package: lib/<tfm>/<id>.dll, newest framework first.
    private static (byte[] Dll, string? Title) ReadPackage(Stream package)
    {
        using var zip = new ZipArchive(package, ZipArchiveMode.Read, leaveOpen: true);

        string? id = null, title = null;
        var nuspec = zip.Entries.FirstOrDefault(e => e.FullName.EndsWith(".nuspec", StringComparison.OrdinalIgnoreCase) && !e.FullName.Contains('/'));
        if (nuspec is not null)
        {
            using var reader = nuspec.Open();
            var meta = XDocument.Load(reader).Descendants().FirstOrDefault(e => e.Name.LocalName == "metadata");
            id = meta?.Elements().FirstOrDefault(e => e.Name.LocalName == "id")?.Value;
            title = meta?.Elements().FirstOrDefault(e => e.Name.LocalName == "title")?.Value;
        }

        var dlls = zip.Entries
            .Where(e => e.FullName.StartsWith("lib/", StringComparison.OrdinalIgnoreCase)
                        && e.FullName.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)
                        && !e.Name.EndsWith(".resources.dll", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(e => e.FullName, StringComparer.OrdinalIgnoreCase).ToList();
        var entry = dlls.FirstOrDefault(e => string.Equals(Path.GetFileNameWithoutExtension(e.Name), id, StringComparison.OrdinalIgnoreCase))
                    ?? dlls.FirstOrDefault()
                    ?? throw new CustomException("The package has no assembly under lib/.");

        using var stream = entry.Open();
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        return (copy.ToArray(), title);
    }

    private static ModuleInspection InspectAssembly(byte[] dll, string? title)
    {
        using var pe = new PEReader(new MemoryStream(dll));
        if (!pe.HasMetadata) throw new CustomException("The file is not a .NET assembly.");
        var md = pe.GetMetadataReader();
        if (!md.IsAssembly) throw new CustomException("The file is a .NET module, not an assembly.");

        var assembly = md.GetAssemblyDefinition();
        var name = md.GetString(assembly.Name);
        var version = assembly.Version.ToString(3);
        var warnings = new List<string>();

        IReadOnlyDictionary<string, object?>? client = null, host = null;
        foreach (var handle in assembly.GetCustomAttributes())
        {
            var attribute = md.GetCustomAttribute(handle);
            switch (AttributeName(md, attribute))
            {
                case ClientAttribute: client = Values(attribute); break;
                case HostAttribute: host = Values(attribute); break;
            }
        }

        var routes = new List<ModuleRouteDto>();
        var layouts = new List<string>();
        var hostTypes = 0;

        foreach (var handle in md.TypeDefinitions)
        {
            var type = md.GetTypeDefinition(handle);
            var fullName = Join(md.GetString(type.Namespace), md.GetString(type.Name));
            var template = new List<string>();
            string? layout = null, authorizeRoles = null;
            var authorize = false;

            foreach (var a in type.GetCustomAttributes())
            {
                var attribute = md.GetCustomAttribute(a);
                switch (AttributeName(md, attribute))
                {
                    case RouteAttribute when FirstString(attribute) is { } t: template.Add(t); break;
                    case LayoutKeyAttribute when FirstString(attribute) is { } key: layouts.Add(key); break;
                    case UseLayoutAttribute: layout = FirstString(attribute); break;
                    case AuthorizeAttribute: authorize = true; authorizeRoles = Values(attribute).GetValueOrDefault("Roles") as string; break;
                }
            }

            var roles = (authorizeRoles ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            routes.AddRange(template.Select(t => new ModuleRouteDto(t, fullName, layout, authorize, roles)));

            var isPublicConcrete = (type.Attributes & TypeAttributes.Public) != 0 && (type.Attributes & (TypeAttributes.Abstract | TypeAttributes.Interface)) == 0;
            if (isPublicConcrete && type.GetInterfaceImplementations().Any(i => InterfaceName(md, md.GetInterfaceImplementation(i).Interface) == HostModuleInterface))
                hostTypes++;
        }

        // Which kind? An explicit attribute wins; otherwise what the assembly contains.
        DetectedModuleKind kind;
        if (client is not null) kind = layouts.Count > 0 && routes.Count == 0 ? DetectedModuleKind.Layout : DetectedModuleKind.Client;
        else if (host is not null || hostTypes > 0) kind = DetectedModuleKind.Host;
        else if (routes.Count > 0) kind = DetectedModuleKind.Client;
        else if (layouts.Count > 0) kind = DetectedModuleKind.Layout;
        else kind = DetectedModuleKind.Unknown;

        if (kind == DetectedModuleKind.Host && hostTypes == 0)
            warnings.Add("Marked as a host module, but it has no public IHostModule class: it will not start anything.");
        if (client is not null && host is not null)
            warnings.Add("Has both [ClientModule] and [HostModule]; treated as a client module.");
        if (hostTypes > 0 && routes.Count > 0 && client is null)
            warnings.Add("Has both pages and an IHostModule; treated as a host module. Add [assembly: ClientModule] to make it a client module.");
        if (kind == DetectedModuleKind.Client && routes.Count == 0)
            warnings.Add("No routable pages (@page) were found in this module.");

        return new ModuleInspection(kind, name, version, title, client, host, routes, layouts.Distinct().ToArray(), [.. warnings]);
    }

    // ---- metadata helpers
    private static string Join(string ns, string name) => ns.Length == 0 ? name : $"{ns}.{name}";

    private static string AttributeName(MetadataReader md, CustomAttribute attribute)
    {
        switch (attribute.Constructor.Kind)
        {
            case HandleKind.MemberReference:
                var member = md.GetMemberReference((MemberReferenceHandle)attribute.Constructor);
                return member.Parent.Kind == HandleKind.TypeReference ? TypeRefName(md, (TypeReferenceHandle)member.Parent) : "";
            case HandleKind.MethodDefinition:
                var method = md.GetMethodDefinition((MethodDefinitionHandle)attribute.Constructor);
                var declaring = md.GetTypeDefinition(method.GetDeclaringType());
                return Join(md.GetString(declaring.Namespace), md.GetString(declaring.Name));
            default:
                return "";
        }
    }

    private static string InterfaceName(MetadataReader md, EntityHandle handle) => handle.Kind switch
    {
        HandleKind.TypeReference => TypeRefName(md, (TypeReferenceHandle)handle),
        HandleKind.TypeDefinition => Join(md.GetString(md.GetTypeDefinition((TypeDefinitionHandle)handle).Namespace),
                                          md.GetString(md.GetTypeDefinition((TypeDefinitionHandle)handle).Name)),
        _ => ""
    };

    private static string TypeRefName(MetadataReader md, TypeReferenceHandle handle)
    {
        var reference = md.GetTypeReference(handle);
        return Join(md.GetString(reference.Namespace), md.GetString(reference.Name));
    }

    private static string? FirstString(CustomAttribute attribute)
    {
        var value = attribute.DecodeValue(TypeProvider.Instance);
        return value.FixedArguments.Length > 0 ? value.FixedArguments[0].Value as string : null;
    }

    /// <summary>Named arguments of an attribute (arrays become string[]).</summary>
    private static Dictionary<string, object?> Values(CustomAttribute attribute)
    {
        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var named in attribute.DecodeValue(TypeProvider.Instance).NamedArguments)
        {
            if (named.Name is null) continue;
            result[named.Name] = named.Value is ImmutableArray<CustomAttributeTypedArgument<string>> array
                ? array.Select(a => a.Value?.ToString() ?? "").ToArray()
                : named.Value;
        }
        return result;
    }

    private sealed class TypeProvider : ICustomAttributeTypeProvider<string>
    {
        public static readonly TypeProvider Instance = new();
        public string GetPrimitiveType(PrimitiveTypeCode typeCode) => typeCode.ToString();
        public string GetSystemType() => "System.Type";
        public string GetSZArrayType(string elementType) => elementType + "[]";
        public string GetTypeFromDefinition(MetadataReader reader, TypeDefinitionHandle handle, byte rawTypeKind)
            => Join(reader.GetString(reader.GetTypeDefinition(handle).Namespace), reader.GetString(reader.GetTypeDefinition(handle).Name));
        public string GetTypeFromReference(MetadataReader reader, TypeReferenceHandle handle, byte rawTypeKind) => TypeRefName(reader, handle);
        public string GetTypeFromSerializedName(string name) => name;
        public PrimitiveTypeCode GetUnderlyingEnumType(string type) => PrimitiveTypeCode.Int32;
        public bool IsSystemType(string type) => type == "System.Type";
    }
}
