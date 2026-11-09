using System.Text.Json;
using FluentValidation;
using MediatR;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Registrations;

internal static class InspectionMapping
{
    public static string? Text(this IReadOnlyDictionary<string, object?>? v, string key)
        => v is not null && v.TryGetValue(key, out var x) && x is string s && !string.IsNullOrWhiteSpace(s) ? s : null;

    public static bool Flag(this IReadOnlyDictionary<string, object?>? v, string key, bool fallback)
        => v is not null && v.TryGetValue(key, out var x) && x is bool b ? b : fallback;

    public static int Number(this IReadOnlyDictionary<string, object?>? v, string key, int fallback)
        => v is not null && v.TryGetValue(key, out var x) && x is int n ? n : fallback;

    public static string[] List(this IReadOnlyDictionary<string, object?>? v, string key)
        => v is not null && v.TryGetValue(key, out var x) && x is string[] a ? a : [];

    /// <summary>"Package@Version" or "Package@Version|https://source" (the form used in [ClientModule(HostDependencies = ...)]).</summary>
    public static HostDependencyRequest ParseHostDependency(string text)
    {
        var parts = text.Split('|', 2, StringSplitOptions.TrimEntries);
        var id = parts[0].Split('@', 2, StringSplitOptions.TrimEntries);
        return new HostDependencyRequest
        {
            Package = id[0],
            Version = id.Length > 1 && id[1].Length > 0 ? id[1] : null,
            SourceUrl = parts.Length > 1 && parts[1].Length > 0 ? parts[1] : null
        };
    }

    /// <summary>"/reports/{id:int}" gives "reports". The root page has no prefix.</summary>
    public static string[] PrefixesOf(IEnumerable<ModuleRouteDto> routes)
        => routes.Select(r => r.Template.Trim('/').Split('/', 2)[0])
            .Where(p => p.Length > 0 && !p.StartsWith('{'))
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

    public static ModuleRoute[] ToRoutes(IEnumerable<ModuleRouteDto> routes)
        => routes.Select(r => new ModuleRoute { Template = r.Template, Component = r.Component, Layout = r.Layout, RequiresAuth = r.RequiresAuth, Roles = r.Roles }).ToArray();

    public static ModuleRouteDto[] ToDtos(IEnumerable<ModuleRoute> routes)
        => routes.Select(r => new ModuleRouteDto(r.Template, r.Component, r.Layout, r.RequiresAuth, r.Roles)).ToArray();
}

// ---- upload just the file: find out what it is and what its defaults are
public sealed record InspectModuleCommand(string FileName, Stream Content) : IRequest<ModuleInspectionDto>;

public sealed class InspectModuleCommandValidator : AbstractValidator<InspectModuleCommand>
{
    public InspectModuleCommandValidator()
        => RuleFor(c => c.FileName).NotEmpty()
            .Must(f => f.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".nupkg", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Only .dll and .nupkg files are accepted.");
}

public sealed class InspectModuleCommandHandler(
    IPendingModuleStore pending, IModuleInspector inspector, IReadRepository<ModuleRegistration> modules)
    : IRequestHandler<InspectModuleCommand, ModuleInspectionDto>
{
    public async Task<ModuleInspectionDto> Handle(InspectModuleCommand command, CancellationToken cancellationToken)
    {
        var token = await pending.SaveAsync(command.FileName, command.Content, cancellationToken);
        try
        {
            ModuleInspection found;
            await using (var file = pending.Open(token)!)
                found = inspector.Inspect(file, command.FileName);

            if (found.Kind == DetectedModuleKind.Unknown)
                throw new CustomException(
                    "Cannot tell what this module is: it has no pages, layouts or IHostModule, and no [assembly: ClientModule] / [assembly: HostModule] attribute.");

            var packageKind = command.FileName.EndsWith(".nupkg", StringComparison.OrdinalIgnoreCase) ? ModuleKind.NuPkg : ModuleKind.Dll;
            var display = found.Title ?? found.AssemblyName;
            string? existingId = null;
            var client = new ModuleRegistrationRequest();
            var host = new HostModuleSettings();

            if (found.Kind == DetectedModuleKind.Host)
            {
                host.Name = found.HostModule.Text("Name") ?? display;
                host.ConfigurationJson = found.HostModule.Text("DefaultConfiguration");
            }
            else
            {
                var a = found.ClientModule;
                var id = RegistrationMapping.ResolveId(a.Text("Id"), found.AssemblyName);
                var existing = await modules.FirstOrDefaultAsync(new ModuleByIdSpec(id), cancellationToken);

                if (existing is not null)
                {
                    // A new build of a module that is installed: its current settings are the starting point, not the defaults.
                    existingId = id;
                    client = new ModuleRegistrationRequest
                    {
                        Id = id, Name = existing.Name, Enabled = existing.Enabled, LoadOnStartup = existing.LoadOnStartup,
                        Hidden = existing.Hidden, RequiresAuth = existing.RequiresAuth, RequiredRole = existing.RequiredRole,
                        Layout = existing.Layout, AvailableToRoles = existing.AvailableToRoles, RoutePrefixes = existing.RoutePrefixes,
                        Dependencies = existing.Dependencies, Styles = existing.Styles, Scripts = existing.Scripts, Nav = existing.Nav
                    };
                }
                else
                {
                    var prefixes = a.List("RoutePrefixes");
                    client = new ModuleRegistrationRequest
                    {
                        Id = id,
                        Name = a.Text("Name") ?? display,
                        Enabled = true, // "register and activate"
                        LoadOnStartup = a.Flag("LoadOnStartup", false),
                        Hidden = a.Flag("Hidden", false),
                        RequiresAuth = a.Flag("RequiresAuth", true),
                        RequiredRole = a.Text("RequiredRole"),
                        Layout = a.Text("Layout"),
                        AvailableToRoles = a.List("AvailableToRoles"),
                        RoutePrefixes = prefixes.Length > 0 ? prefixes : InspectionMapping.PrefixesOf(found.Routes),
                        Dependencies = a.List("Dependencies"),
                        Styles = a.List("Styles"),
                        Scripts = a.List("Scripts"),
                        Nav = a.Text("NavTitle") is { } title ? [new ModuleNavItem(title, a.Text("NavHref") ?? "", a.Number("NavOrder", 100))] : []
                    };
                }

                client.HostDependencies = a.List("HostDependencies").Select(InspectionMapping.ParseHostDependency).ToArray();
            }

            var dto = new ModuleInspectionDto(token, Path.GetFileName(command.FileName), packageKind, found.Kind, found.AssemblyName, found.Version,
                display, existingId, client, host, found.Routes, found.LayoutKeys, found.Warnings);
            await pending.SaveInspectionAsync(token, dto, cancellationToken);
            return dto;
        }
        catch
        {
            pending.Delete(token);
            throw;
        }
    }
}

public sealed record GetModuleInspectionQuery(string Token) : IRequest<ModuleInspectionDto>;

public sealed class GetModuleInspectionQueryHandler(IPendingModuleStore pending) : IRequestHandler<GetModuleInspectionQuery, ModuleInspectionDto>
{
    public async Task<ModuleInspectionDto> Handle(GetModuleInspectionQuery query, CancellationToken cancellationToken)
        => await pending.FindInspectionAsync(query.Token, cancellationToken)
           ?? throw new NotFoundException("This upload is no longer waiting (it was installed, discarded or expired). Upload the file again.");
}

public sealed record DiscardModuleInspectionCommand(string Token) : IRequest;

public sealed class DiscardModuleInspectionCommandHandler(IPendingModuleStore pending) : IRequestHandler<DiscardModuleInspectionCommand>
{
    public Task Handle(DiscardModuleInspectionCommand command, CancellationToken cancellationToken)
    {
        pending.Delete(command.Token);
        return Task.CompletedTask;
    }
}

// ---- confirm: client / layout module
public sealed record InstallInspectedClientModuleCommand(string Token, ModuleRegistrationRequest Request) : IRequest<ModuleRegistrationDto>;

/// <summary>Registers the waiting file with the confirmed settings (host modules first, see RegisterClientModuleCommand). An installed id also gets the edited settings.</summary>
public sealed class InstallInspectedClientModuleCommandHandler(IPendingModuleStore pending, ISender sender)
    : IRequestHandler<InstallInspectedClientModuleCommand, ModuleRegistrationDto>
{
    public async Task<ModuleRegistrationDto> Handle(InstallInspectedClientModuleCommand command, CancellationToken cancellationToken)
    {
        var inspection = await pending.FindInspectionAsync(command.Token, cancellationToken)
                         ?? throw new NotFoundException("This upload is no longer waiting. Upload the file again.");
        if (inspection.Detected is not (DetectedModuleKind.Client or DetectedModuleKind.Layout))
            throw new CustomException("This file is a host module.");

        command.Request.Id = inspection.ExistingId ?? command.Request.Id ?? inspection.Client.Id;

        ModuleRegistrationDto result;
        await using (var file = pending.Open(command.Token) ?? throw new NotFoundException("The waiting file is gone. Upload it again."))
            result = await sender.Send(new RegisterClientModuleCommand(inspection.FileName, file, command.Request), cancellationToken);

        if (inspection.ExistingId is not null)
            result = await sender.Send(new UpdateModuleRegistrationCommand(inspection.ExistingId, command.Request), cancellationToken);

        pending.Delete(command.Token);
        return result;
    }
}

// ---- confirm: host module
public sealed record InstallInspectedHostModuleCommand(string Token, HostModuleSettings Settings) : IRequest<ModulePackageDto>;

public sealed class InstallInspectedHostModuleCommandHandler(IPendingModuleStore pending, IModulePackageStore store, ICurrentUser user)
    : IRequestHandler<InstallInspectedHostModuleCommand, ModulePackageDto>
{
    public async Task<ModulePackageDto> Handle(InstallInspectedHostModuleCommand command, CancellationToken cancellationToken)
    {
        var inspection = await pending.FindInspectionAsync(command.Token, cancellationToken)
                         ?? throw new NotFoundException("This upload is no longer waiting. Upload the file again.");
        if (inspection.Detected != DetectedModuleKind.Host)
            throw new CustomException("This file is not a host module.");

        var configuration = string.IsNullOrWhiteSpace(command.Settings.ConfigurationJson) ? null : command.Settings.ConfigurationJson;
        if (configuration is not null && !IsJsonObject(configuration))
            throw new CustomException("The configuration must be a JSON object.");

        ModulePackage package;
        await using (var file = pending.Open(command.Token) ?? throw new NotFoundException("The waiting file is gone. Upload it again."))
            package = await store.AddAsync(ModuleTarget.Host, inspection.FileName, file, command.Settings.Name, user.UserName, cancellationToken);

        try
        {
            package.Configuration = configuration;
            if (command.Settings.Enabled)
            {
                // A new version replaces the enabled one: two versions of a package cannot both be referenced by the build.
                foreach (var other in (await store.ListAsync(cancellationToken))
                             .Where(p => p.Id != package.Id && p.Enabled && p.Target == ModuleTarget.Host
                                         && string.Equals(p.PackageId, package.PackageId, StringComparison.OrdinalIgnoreCase)))
                {
                    other.Enabled = false;
                    await store.UpdateAsync(other, cancellationToken);
                }
                package.Enabled = true;
            }
            await store.UpdateAsync(package, cancellationToken);
        }
        catch
        {
            await store.DeleteAsync(package.Id, cancellationToken);
            throw;
        }

        pending.Delete(command.Token);
        return package.ToDto(store);
    }

    private static bool IsJsonObject(string json)
    {
        try { using var doc = JsonDocument.Parse(json); return doc.RootElement.ValueKind == JsonValueKind.Object; }
        catch (JsonException) { return false; }
    }
}
