using System.Collections.Immutable;
using System.IO.Compression;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace soft.square.net.WebApi.Modules.Core.ClientModules;

/// <summary>A file of a package as it will be stored.</summary>
internal sealed record PackageFile(string Name, byte[] Content)
{
    public string Sha256 { get; } = Convert.ToHexStringLower(SHA256.HashData(Content));
    public ClientModuleFile Describe() => new(Name, Sha256, Content.LongLength);
}

/// <summary>A checked package: what to store (<see cref="Files"/>, primary first) and what was read from it.</summary>
internal sealed record InspectedPackage(
    ClientModuleKind Kind,
    string Id,
    string Version,
    ClientModuleSettings Detected,
    IReadOnlyList<PackageFile> Files,
    IReadOnlyList<string> Routes,
    IReadOnlyList<string> Layouts,
    IReadOnlyList<string> Warnings)
{
    /// <summary>
    /// SHA-256 over the files' names and hashes: equal for the same files, whatever the upload's format. A .nupkg is
    /// hashed by its content (the entries NuGet does not regenerate on every pack), so packing the same code again is
    /// not a new package.
    /// </summary>
    public string PackageHash => Hash(Kind == ClientModuleKind.NuPkg && Files.Count == 1 // computed: `with` copies would keep a stale field
        ? NuPkgContent(Files[0].Content)
        : Files.Select(f => (f.Name, f.Sha256)));

    private static string Hash(IEnumerable<(string Name, string Sha256)> files) => Convert.ToHexStringLower(SHA256.HashData(
        System.Text.Encoding.UTF8.GetBytes(string.Join('\n', files.OrderBy(f => f.Name, StringComparer.Ordinal).Select(f => $"{f.Name}:{f.Sha256}")))));

    /// <summary>The package's entries without the packaging parts that change on every pack (random ids, timestamps).</summary>
    private static IEnumerable<(string, string)> NuPkgContent(byte[] content)
    {
        using var zip = new System.IO.Compression.ZipArchive(new MemoryStream(content), System.IO.Compression.ZipArchiveMode.Read);
        return zip.Entries
            .Where(e => e.Length > 0
                        && !e.FullName.StartsWith("_rels/", StringComparison.OrdinalIgnoreCase)
                        && !e.FullName.StartsWith("package/", StringComparison.OrdinalIgnoreCase)
                        && !e.FullName.Equals("[Content_Types].xml", StringComparison.OrdinalIgnoreCase))
            .Select(e =>
            {
                using var stream = e.Open();
                return (e.FullName, Convert.ToHexStringLower(SHA256.HashData(stream)));
            })
            .ToList();
    }
}

/// <summary>
/// Reads client module packages with System.Reflection.Metadata: types and attributes are read as data, nothing is
/// loaded or run on the server. Accepts
/// <list type="bullet">
/// <item>a .dll with <c>[assembly: ClientModule]</c> (static files embedded as "module-assets/..." resources);</item>
/// <item>a .nupkg (lib/&lt;tfm&gt;/*.dll and staticwebassets/*), stored and served as is;</item>
/// <item>a .zip (or a seed folder) of assemblies: the one with [ClientModule] is the module, the others its private
/// assemblies (e.g. a generated API client). An optional client-module.json overrides the attribute's settings.</item>
/// </list>
/// </summary>
internal static partial class ClientModuleInspector
{
    private const string ClientAttribute = "soft.square.net.ModularBlazor.Abstractions.ClientModuleAttribute";
    private const string LayoutKeyAttribute = "soft.square.net.ModularBlazor.Abstractions.LayoutKeyAttribute";
    private const string RouteAttribute = "Microsoft.AspNetCore.Components.RouteAttribute";
    private const string AssemblyPrefix = "soft.square.net.";
    public const string SettingsFile = "client-module.json";

    /// <summary>Server-side frameworks: a browser module referencing them fails when it runs.</summary>
    private static readonly string[] ServerOnly =
        ["soft.square.net.WebApi.Contracts", "Microsoft.AspNetCore.Mvc.Core", "Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore.Server.Kestrel.Core"];

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static InspectedPackage Inspect(string fileName, byte[] content)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension switch
        {
            ".dll" => FromAssemblies([new PackageFile(SafeName(fileName), content)], settingsJson: null),
            ".nupkg" => FromNuPkg(content),
            ".zip" => FromZip(content),
            _ => throw new ClientModuleException($"'{fileName}': upload a .dll, .nupkg or .zip.")
        };
    }

    /// <summary>A seed folder: its assemblies form one module, like a .zip.</summary>
    public static InspectedPackage InspectFolder(string folder)
    {
        var files = Directory.EnumerateFiles(folder, "*.dll", SearchOption.TopDirectoryOnly)
            .Where(f => !f.EndsWith(".resources.dll", StringComparison.OrdinalIgnoreCase))
            .Select(f => new PackageFile(SafeName(Path.GetFileName(f)), File.ReadAllBytes(f)))
            .ToList();
        var settings = Path.Combine(folder, SettingsFile);
        return FromAssemblies(files, File.Exists(settings) ? File.ReadAllText(settings) : null);
    }

    // ---------------------------------------------------------------- formats

    private static InspectedPackage FromZip(byte[] content)
    {
        using var zip = OpenZip(content);
        var files = new List<PackageFile>();
        string? settings = null;
        foreach (var entry in zip.Entries.Where(e => e.Length > 0))
        {
            if (entry.Name.Equals(SettingsFile, StringComparison.OrdinalIgnoreCase))
                settings = new StreamReader(entry.Open()).ReadToEnd();
            else if (entry.Name.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) && !entry.Name.EndsWith(".resources.dll", StringComparison.OrdinalIgnoreCase))
            {
                var name = SafeName(entry.Name);
                if (files.Any(f => f.Name.Equals(name, StringComparison.OrdinalIgnoreCase)))
                    throw new ClientModuleException($"The .zip has two files named '{name}'.");
                files.Add(new PackageFile(name, Read(entry)));
            }
        }
        if (files.Count == 0) throw new ClientModuleException("The .zip has no assemblies (.dll).");
        return FromAssemblies(files, settings);
    }

    private static InspectedPackage FromNuPkg(byte[] content)
    {
        using var zip = OpenZip(content);
        string? id = null, version = null, title = null;
        var nuspec = zip.Entries.FirstOrDefault(e => e.FullName.EndsWith(".nuspec", StringComparison.OrdinalIgnoreCase) && !e.FullName.Contains('/'))
                     ?? throw new ClientModuleException("The package has no .nuspec: not a NuGet package.");
        using (var stream = nuspec.Open())
        {
            var metadata = XDocument.Load(stream).Descendants().FirstOrDefault(e => e.Name.LocalName == "metadata");
            string? Value(string name) => metadata?.Elements().FirstOrDefault(e => e.Name.LocalName == name)?.Value;
            (id, version, title) = (Value("id"), Value("version"), Value("title"));
        }

        // The newest target framework folder under lib/.
        var libs = zip.Entries
            .Where(e => e.FullName.StartsWith("lib/", StringComparison.OrdinalIgnoreCase)
                        && e.FullName.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)
                        && !e.Name.EndsWith(".resources.dll", StringComparison.OrdinalIgnoreCase))
            .GroupBy(e => e.FullName.Split('/')[1], StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault()
            ?? throw new ClientModuleException("The package has no assemblies under lib/.");

        var assemblies = libs.Select(e => new PackageFile(SafeName(e.Name), Read(e))).ToList();
        var inspected = FromAssemblies(assemblies, settingsJson: null, preferredName: id);

        var packageVersion = NormalizeVersion(version) ?? inspected.Version;
        var detected = inspected.Detected with { Name = inspected.Detected.Name ?? title };
        var stored = new PackageFile(SafeName($"{inspected.Id}.{packageVersion}.nupkg"), content);
        return inspected with { Kind = ClientModuleKind.NuPkg, Version = packageVersion, Detected = detected, Files = [stored] };
    }

    private static InspectedPackage FromAssemblies(List<PackageFile> files, string? settingsJson, string? preferredName = null)
    {
        if (files.Count == 0) throw new ClientModuleException("No assemblies to install.");

        var read = files.Select(f => (File: f, Info: ReadAssembly(f))).ToList();
        var warnings = new List<string>();

        foreach (var (file, info) in read)
            foreach (var reference in info.References.Where(r => ServerOnly.Contains(r, StringComparer.OrdinalIgnoreCase)))
            {
                if (reference.Equals(ServerOnly[0], StringComparison.OrdinalIgnoreCase))
                    throw new ClientModuleException($"{file.Name} is a WebApi (server) module: install it under Host modules, not as a client module.");
                warnings.Add($"{file.Name} references {reference}, a server-side framework; it will fail in the browser when that code runs.");
            }

        // The module: the assembly with [ClientModule]; otherwise the one with pages or layouts.
        var marked = read.Where(r => r.Info.Attribute is not null).ToList();
        if (marked.Count > 1)
            throw new ClientModuleException($"More than one assembly has [assembly: ClientModule]: {string.Join(", ", marked.Select(m => m.File.Name))}. Upload one module per package.");
        var primary = marked.FirstOrDefault();
        if (primary.File is null)
        {
            var candidates = read.Where(r => r.Info.Routes.Count > 0 || r.Info.Layouts.Count > 0).ToList();
            if (preferredName is not null && candidates.Count > 1)
                candidates = candidates.Where(c => Path.GetFileNameWithoutExtension(c.File.Name).Equals(preferredName, StringComparison.OrdinalIgnoreCase)).ToList();
            if (candidates.Count != 1)
                throw new ClientModuleException("No assembly has [assembly: ClientModule], and pages or layouts do not single one out. Add the attribute to the module.");
            primary = candidates[0];
            warnings.Add($"{primary.File.Name} has no [assembly: ClientModule]; its settings are guessed from its pages.");
        }
        if (!primary.Info.References.Any(r => r.StartsWith("Microsoft.AspNetCore.Components", StringComparison.OrdinalIgnoreCase)))
            warnings.Add($"{primary.File.Name} does not reference Blazor (Microsoft.AspNetCore.Components).");

        var attribute = primary.Info.Attribute ?? new Dictionary<string, object?>();
        var id = attribute.GetValueOrDefault("Id") as string
                 ?? (primary.Info.Name.StartsWith(AssemblyPrefix, StringComparison.Ordinal) ? primary.Info.Name[AssemblyPrefix.Length..] : primary.Info.Name);
        RequireId(id);

        var detected = Detect(attribute, primary.Info.Routes);
        if (settingsJson is not null) detected = Overlay(detected, settingsJson);
        if (detected.LoadStrategy == ClientModuleLoadStrategy.Startup && detected.RequiresAuth)
            warnings.Add("Startup module that requires sign-in: it is only loaded after sign-in. Set RequiresAuth = false for layouts and themes.");
        if (attribute.GetValueOrDefault("HostDependencies") is string[] { Length: > 0 } hostDependencies)
            warnings.Add($"Needs these host modules: {string.Join(", ", hostDependencies)}. Install them under Host modules.");
        if (primary.Info.Routes.Count == 0 && primary.Info.Layouts.Count == 0)
            warnings.Add("No pages (@page) and no layouts ([LayoutKey]) were found.");

        var ordered = new List<PackageFile> { primary.File };
        ordered.AddRange(files.Where(f => f != primary.File).OrderBy(f => f.Name, StringComparer.OrdinalIgnoreCase));

        return new InspectedPackage(ClientModuleKind.Dll, id, primary.Info.Version, detected, ordered,
            primary.Info.Routes, primary.Info.Layouts, warnings);
    }

    // ---------------------------------------------------------------- settings

    private static ClientModuleSettings Detect(IReadOnlyDictionary<string, object?> a, IReadOnlyList<string> routes)
    {
        string[] Strings(string name) => a.GetValueOrDefault(name) as string[] ?? [];
        var prefixes = Strings("RoutePrefixes");
        if (prefixes.Length == 0)
            prefixes = routes.Select(FirstSegment).OfType<string>().Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

        var nav = a.GetValueOrDefault("NavTitle") is string title && a.GetValueOrDefault("NavHref") is string href
            ? new[] { new ClientModuleNavItem(title, href, a.GetValueOrDefault("NavOrder") as int? ?? 100) }
            : [];

        return new ClientModuleSettings
        {
            Name = a.GetValueOrDefault("Name") as string,
            LoadStrategy = a.GetValueOrDefault("LoadOnStartup") is true ? ClientModuleLoadStrategy.Startup : ClientModuleLoadStrategy.Lazy,
            Hidden = a.GetValueOrDefault("Hidden") is true,
            RequiresAuth = a.GetValueOrDefault("RequiresAuth") as bool? ?? true,
            RequiredRole = a.GetValueOrDefault("RequiredRole") as string,
            AvailableToRoles = Strings("AvailableToRoles"),
            Layout = a.GetValueOrDefault("Layout") as string,
            RoutePrefixes = prefixes,
            Dependencies = Strings("Dependencies"),
            Styles = Strings("Styles"),
            Scripts = Strings("Scripts"),
            Nav = nav
        };
    }

    /// <summary>client-module.json: the properties it sets replace the detected ones.</summary>
    private static ClientModuleSettings Overlay(ClientModuleSettings detected, string json)
    {
        try
        {
            var target = JsonSerializer.SerializeToNode(detected, Json)!.AsObject();
            foreach (var (name, value) in JsonNode.Parse(json)?.AsObject() ?? [])
            {
                var key = target.Select(p => p.Key).FirstOrDefault(k => k.Equals(name, StringComparison.OrdinalIgnoreCase)) ?? name;
                target[key] = value?.DeepClone();
            }
            return target.Deserialize<ClientModuleSettings>(Json) ?? detected;
        }
        catch (JsonException e)
        {
            throw new ClientModuleException($"{SettingsFile} is not valid: {e.Message}");
        }
    }

    private static string? FirstSegment(string template)
    {
        var segment = template.Trim('/').Split('/', 2)[0];
        return segment.Length == 0 || segment.StartsWith('{') ? null : segment;
    }

    // ---------------------------------------------------------------- metadata

    private sealed record AssemblyInfo(string Name, string Version, IReadOnlyDictionary<string, object?>? Attribute,
        IReadOnlyList<string> Routes, IReadOnlyList<string> Layouts, IReadOnlyList<string> References);

    private static AssemblyInfo ReadAssembly(PackageFile file)
    {
        try
        {
            using var pe = new PEReader(new MemoryStream(file.Content));
            if (!pe.HasMetadata) throw new ClientModuleException($"{file.Name} is not a .NET assembly.");
            var md = pe.GetMetadataReader();
            if (!md.IsAssembly) throw new ClientModuleException($"{file.Name} is a .NET module, not an assembly.");

            var assembly = md.GetAssemblyDefinition();
            IReadOnlyDictionary<string, object?>? client = null;
            string? informational = null;
            foreach (var handle in assembly.GetCustomAttributes())
            {
                var attribute = md.GetCustomAttribute(handle);
                switch (AttributeName(md, attribute))
                {
                    case ClientAttribute: client = Values(attribute); break;
                    case "System.Reflection.AssemblyInformationalVersionAttribute": informational = FirstString(attribute); break;
                }
            }

            var routes = new List<string>();
            var layouts = new List<string>();
            foreach (var handle in md.TypeDefinitions)
                foreach (var a in md.GetTypeDefinition(handle).GetCustomAttributes())
                {
                    var attribute = md.GetCustomAttribute(a);
                    switch (AttributeName(md, attribute))
                    {
                        case RouteAttribute when FirstString(attribute) is { } template: routes.Add(template); break;
                        case LayoutKeyAttribute when FirstString(attribute) is { } key: layouts.Add(key); break;
                    }
                }

            var references = md.AssemblyReferences.Select(r => md.GetString(md.GetAssemblyReference(r).Name)).ToList();
            var version = NormalizeVersion(informational) ?? assembly.Version.ToString(3);
            return new AssemblyInfo(md.GetString(assembly.Name), version, client, routes.Distinct().Order().ToList(), layouts.Distinct().ToList(), references);
        }
        catch (BadImageFormatException)
        {
            throw new ClientModuleException($"{file.Name} is not a .NET assembly.");
        }
    }

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

    // ---------------------------------------------------------------- names

    private static ZipArchive OpenZip(byte[] content)
    {
        try { return new ZipArchive(new MemoryStream(content), ZipArchiveMode.Read); }
        catch (InvalidDataException) { throw new ClientModuleException("The file is not a valid .zip / .nupkg archive."); }
    }

    private static byte[] Read(ZipArchiveEntry entry)
    {
        using var stream = entry.Open();
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        return copy.ToArray();
    }

    /// <summary>"1.2.3+abc" → "1.2.3"; null when it is not a usable version.</summary>
    private static string? NormalizeVersion(string? version)
    {
        var value = version?.Split('+', 2)[0].Trim();
        return value is { Length: > 0 } && VersionPattern().IsMatch(value) ? value : null;
    }

    public static void RequireId(string id)
    {
        if (!IdPattern().IsMatch(id))
            throw new ClientModuleException($"'{id}' is not a valid module id (letters, digits, '.', '_', '-'; at most 100).");
    }

    public static bool IsSafeName(string name) => FilePattern().IsMatch(name) && name is not "." and not "..";

    private static string SafeName(string name)
    {
        var file = Path.GetFileName(name);
        return IsSafeName(file) ? file : throw new ClientModuleException($"'{name}' is not an allowed file name (letters, digits, '.', '_', '-').");
    }

    [GeneratedRegex("^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")]
    public static partial Regex IdPattern();

    [GeneratedRegex("^[0-9A-Za-z][0-9A-Za-z.-]{0,49}$")]
    public static partial Regex VersionPattern();

    [GeneratedRegex("^[A-Za-z0-9._-]{1,200}$")]
    private static partial Regex FilePattern();
}
