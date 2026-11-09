using System.Net;
using System.Text.RegularExpressions;
using Ardalis.Specification;
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

internal static partial class RegistrationMapping
{
    private const string AssemblyPrefix = "soft.square.net.";

    [GeneratedRegex("^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$")]
    public static partial Regex IdPattern();

    /// <summary>"Module.Reports" from "soft.square.net.Module.Reports" unless the administrator chose an id.</summary>
    public static string ResolveId(string? requested, string packageId)
    {
        var id = string.IsNullOrWhiteSpace(requested) ? packageId : requested.Trim();
        if (string.IsNullOrWhiteSpace(requested) && id.StartsWith(AssemblyPrefix, StringComparison.OrdinalIgnoreCase))
            id = id[AssemblyPrefix.Length..];
        if (!IdPattern().IsMatch(id))
            throw new CustomException($"'{id}' is not a valid module id (letters, digits, '.', '_' and '-').");
        return id;
    }

    public static string FileUrl(string id) => $"api/modules/{Uri.EscapeDataString(id)}/file";

    public static void Apply(this ModuleRegistration m, ModuleRegistrationRequest r)
    {
        m.LoadOnStartup = r.LoadOnStartup;
        m.Hidden = r.Hidden;
        m.RequiresAuth = r.RequiresAuth;
        m.RequiredRole = string.IsNullOrWhiteSpace(r.RequiredRole) ? null : r.RequiredRole.Trim();
        m.Layout = string.IsNullOrWhiteSpace(r.Layout) ? null : r.Layout.Trim();
        m.AvailableToRoles = Clean(r.AvailableToRoles);
        m.RoutePrefixes = Clean(r.RoutePrefixes).Select(p => p.Trim('/')).ToArray();
        m.Dependencies = Clean(r.Dependencies);
        m.Styles = Clean(r.Styles);
        m.Scripts = Clean(r.Scripts);
        m.Nav = r.Nav.Where(n => !string.IsNullOrWhiteSpace(n.Title)).ToArray();
    }

    private static string[] Clean(IEnumerable<string>? values)
        => (values ?? []).Select(v => v.Trim()).Where(v => v.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

    public static ModuleRegistrationDto ToDto(this ModuleRegistration m, ModulePackage? package) => new(
        m.Id, m.Name, m.Version, m.Kind, m.Url, m.Sha256, m.Enabled, m.LoadOnStartup, m.Hidden, m.RequiresAuth,
        m.RequiredRole, m.Layout, m.AvailableToRoles, m.RoutePrefixes, m.Dependencies, m.Styles, m.Scripts, m.Nav,
        m.PackageId, package?.FileName, package?.SizeBytes, package?.UploadedUtc);

    public static async Task<ModuleRegistration> GetAsync(this IReadRepositoryBase<ModuleRegistration> modules, string id, CancellationToken ct)
        => await modules.FirstOrDefaultAsync(new ModuleByIdSpec(id), ct) ?? throw new NotFoundException($"Module '{id}' was not found.");
}

// ---- list
public sealed record ListModuleRegistrationsQuery : IRequest<IReadOnlyList<ModuleRegistrationDto>>;

public sealed class ListModuleRegistrationsQueryHandler(IReadRepository<ModuleRegistration> modules, IModulePackageStore store)
    : IRequestHandler<ListModuleRegistrationsQuery, IReadOnlyList<ModuleRegistrationDto>>
{
    public async Task<IReadOnlyList<ModuleRegistrationDto>> Handle(ListModuleRegistrationsQuery request, CancellationToken cancellationToken)
    {
        var packages = (await store.ListAsync(cancellationToken)).ToDictionary(p => p.Id);
        var all = await modules.ListAsync(new AllModulesSpec(), cancellationToken);
        return all.Select(m => m.ToDto(m.PackageId is not null ? packages.GetValueOrDefault(m.PackageId) : null)).ToList();
    }
}

// ---- upload + register
public sealed record RegisterClientModuleCommand(string FileName, Stream Content, ModuleRegistrationRequest Request)
    : IRequest<ModuleRegistrationDto>;

public sealed class RegisterClientModuleCommandValidator : AbstractValidator<RegisterClientModuleCommand>
{
    public RegisterClientModuleCommandValidator()
    {
        RuleFor(c => c.FileName).NotEmpty()
            .Must(f => f.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".nupkg", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Only .dll and .nupkg files are accepted.");
        RuleFor(c => c.Request.Id).Must(id => string.IsNullOrWhiteSpace(id) || RegistrationMapping.IdPattern().IsMatch(id.Trim()))
            .WithMessage("The module id may contain letters, digits, '.', '_' and '-'.");
        RuleFor(c => c.Request.Name).MaximumLength(200);
    }
}

/// <summary>
/// Stores the file (client side of the module store) and registers it in the catalog. A new id starts disabled and takes the
/// metadata from the request. An existing id gets the new file (version, hash, url) and keeps its metadata and enabled flag:
/// uploading a new build of a module must not reset its routes.
/// </summary>
public sealed class RegisterClientModuleCommandHandler(
    IModulePackageStore store, IRepository<ModuleRegistration> modules, ICurrentUser user)
    : IRequestHandler<RegisterClientModuleCommand, ModuleRegistrationDto>
{
    public async Task<ModuleRegistrationDto> Handle(RegisterClientModuleCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var package = await store.AddAsync(ModuleTarget.Client, command.FileName, command.Content, request.Name, user.UserName, cancellationToken);

        try
        {
            var id = RegistrationMapping.ResolveId(request.Id, package.PackageId);
            var url = RegistrationMapping.FileUrl(id);
            var name = string.IsNullOrWhiteSpace(request.Name) ? id : request.Name.Trim();
            var existing = await modules.FirstOrDefaultAsync(new ModuleByIdSpec(id), cancellationToken);
            string? replacedPackage = null;

            if (existing is null)
            {
                existing = new ModuleRegistration(id, name, package.Version, package.Kind, url)
                {
                    Sha256 = package.Sha256,
                    PackageId = package.Id,
                    Enabled = request.Enabled,
                    SortOrder = 100 + (await modules.CountAsync(cancellationToken)) * 10
                };
                existing.Apply(request);
                await modules.AddAsync(existing, cancellationToken);
            }
            else
            {
                replacedPackage = existing.PackageId;
                existing.Describe(string.IsNullOrWhiteSpace(request.Name) ? existing.Name : name, package.Version, package.Kind, url);
                existing.Sha256 = package.Sha256;
                existing.PackageId = package.Id;
            }

            await modules.SaveChangesAsync(cancellationToken);

            // The superseded file is no longer referenced by anything.
            if (replacedPackage is not null && replacedPackage != package.Id)
                await store.DeleteAsync(replacedPackage, cancellationToken);

            return existing.ToDto(package);
        }
        catch
        {
            await store.DeleteAsync(package.Id, cancellationToken); // do not leave an orphan file behind
            throw;
        }
    }
}

// ---- edit metadata
public sealed record UpdateModuleRegistrationCommand(string Id, ModuleRegistrationRequest Request) : IRequest<ModuleRegistrationDto>;

public sealed class UpdateModuleRegistrationCommandHandler(IRepository<ModuleRegistration> modules, IModulePackageStore store)
    : IRequestHandler<UpdateModuleRegistrationCommand, ModuleRegistrationDto>
{
    public async Task<ModuleRegistrationDto> Handle(UpdateModuleRegistrationCommand command, CancellationToken cancellationToken)
    {
        var module = await modules.GetAsync(command.Id, cancellationToken);
        if (!string.IsNullOrWhiteSpace(command.Request.Name))
            module.Describe(command.Request.Name.Trim(), module.Version, module.Kind, module.Url);

        module.Apply(command.Request);
        await modules.SaveChangesAsync(cancellationToken);
        return module.ToDto(module.PackageId is null ? null : await store.FindAsync(module.PackageId, cancellationToken));
    }
}

// ---- enable / disable
public sealed record SetModuleRegistrationEnabledCommand(string Id, bool Enabled) : IRequest<ModuleRegistrationDto>;

public sealed class SetModuleRegistrationEnabledCommandHandler(IRepository<ModuleRegistration> modules, IModulePackageStore store)
    : IRequestHandler<SetModuleRegistrationEnabledCommand, ModuleRegistrationDto>
{
    public async Task<ModuleRegistrationDto> Handle(SetModuleRegistrationEnabledCommand command, CancellationToken cancellationToken)
    {
        var module = await modules.GetAsync(command.Id, cancellationToken);
        module.Enabled = command.Enabled;
        await modules.SaveChangesAsync(cancellationToken);
        return module.ToDto(module.PackageId is null ? null : await store.FindAsync(module.PackageId, cancellationToken));
    }
}

// ---- delete
public sealed record DeleteModuleRegistrationCommand(string Id) : IRequest;

public sealed class DeleteModuleRegistrationCommandHandler(IRepository<ModuleRegistration> modules, IModulePackageStore store)
    : IRequestHandler<DeleteModuleRegistrationCommand>
{
    public async Task Handle(DeleteModuleRegistrationCommand command, CancellationToken cancellationToken)
    {
        var module = await modules.GetAsync(command.Id, cancellationToken);

        var dependents = (await modules.ListAsync(new AllModulesSpec(), cancellationToken))
            .Where(m => m.Id != module.Id && m.Dependencies.Contains(module.Id, StringComparer.OrdinalIgnoreCase))
            .Select(m => m.Id).ToList();
        if (dependents.Count > 0)
            throw new ConflictException($"'{module.Id}' is required by {string.Join(", ", dependents)}.");

        await modules.DeleteAsync(module, cancellationToken);
        await modules.SaveChangesAsync(cancellationToken);

        if (module.PackageId is not null) await store.DeleteAsync(module.PackageId, cancellationToken);
    }
}

// ---- download (for the client app)
/// <summary>
/// Core modules (LoadOnStartup) are public: the client needs them before anyone signs in. A user module is released only to a
/// signed-in user it is offered to (AvailableToRoles) and, when the module names a RequiredRole, who holds that role.
/// </summary>
public sealed record GetModuleFileQuery(string Id, bool IsAuthenticated, string[] Roles) : IRequest<ModulePackageFile>;

public sealed class GetModuleFileQueryHandler(IReadRepository<ModuleRegistration> modules, IModulePackageStore store)
    : IRequestHandler<GetModuleFileQuery, ModulePackageFile>
{
    public async Task<ModulePackageFile> Handle(GetModuleFileQuery query, CancellationToken cancellationToken)
    {
        var module = await modules.FirstOrDefaultAsync(new ModuleByIdSpec(query.Id), cancellationToken);
        if (module is not { Enabled: true, PackageId: not null })
            throw new NotFoundException($"Module '{query.Id}' is not available.");

        if (!module.LoadOnStartup)
        {
            if (!query.IsAuthenticated)
                throw new CustomException("Sign in to download this module.", HttpStatusCode.Unauthorized);

            var allowed = module.IsAvailableTo(query.Roles)
                          && (module.RequiredRole is null || query.Roles.Contains(module.RequiredRole, StringComparer.OrdinalIgnoreCase));
            if (!allowed)
                throw new CustomException("This module is not available to your account.", HttpStatusCode.Forbidden);
        }

        var package = await store.FindAsync(module.PackageId, cancellationToken)
                      ?? throw new NotFoundException($"The file of module '{query.Id}' is missing from the module store.");

        var type = package.Kind == ModuleKind.NuPkg ? "application/octet-stream" : "application/x-msdownload";
        return new ModulePackageFile(store.OpenRead(package), package.FileName, type, package.Sha256);
    }
}
