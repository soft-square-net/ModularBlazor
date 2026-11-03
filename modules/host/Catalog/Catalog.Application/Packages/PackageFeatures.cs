using System.Text.Json;
using FluentValidation;
using MediatR;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;

public sealed record ModulePackageDto(
    string Id, string Name, string PackageId, string Version, ModuleTarget Target, ModuleKind Kind,
    string FileName, string Sha256, long SizeBytes, bool Enabled, bool Loaded, bool RebuildRequired,
    string? Configuration, DateTime UploadedUtc, string? UploadedBy);

public sealed record ModulePackageFile(Stream Content, string FileName, string ContentType);

internal static class PackageMapping
{
    /// <summary>A host package takes effect only after a rebuild: enabled but not loaded, or loaded but disabled.</summary>
    public static ModulePackageDto ToDto(this ModulePackage p, IModulePackageStore store)
    {
        var loaded = p.Target == ModuleTarget.Host && store.IsLoaded(p);
        var rebuild = p.Target == ModuleTarget.Host && p.Enabled != loaded;
        return new ModulePackageDto(p.Id, p.Name, p.PackageId, p.Version, p.Target, p.Kind, p.FileName, p.Sha256,
            p.SizeBytes, p.Enabled, loaded, rebuild, p.Configuration, p.UploadedUtc, p.UploadedBy);
    }

    public static async Task<ModulePackage> GetAsync(this IModulePackageStore store, string id, CancellationToken ct)
        => await store.FindAsync(id, ct) ?? throw new NotFoundException($"Module package '{id}' was not found.");
}

// ---- upload
public sealed record UploadModulePackageCommand(ModuleTarget Target, string FileName, Stream Content, string? Name)
    : IRequest<ModulePackageDto>;

public sealed class UploadModulePackageCommandValidator : AbstractValidator<UploadModulePackageCommand>
{
    public UploadModulePackageCommandValidator()
    {
        RuleFor(c => c.FileName).NotEmpty()
            .Must(f => f.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".nupkg", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Only .dll and .nupkg files are accepted.");
        RuleFor(c => c.Name).MaximumLength(200);
    }
}

public sealed class UploadModulePackageCommandHandler(IModulePackageStore store, ICurrentUser user)
    : IRequestHandler<UploadModulePackageCommand, ModulePackageDto>
{
    public async Task<ModulePackageDto> Handle(UploadModulePackageCommand request, CancellationToken cancellationToken)
        => (await store.AddAsync(request.Target, request.FileName, request.Content, request.Name, user.UserName, cancellationToken))
            .ToDto(store);
}

// ---- list / get / download
public sealed record ListModulePackagesQuery(ModuleTarget? Target) : IRequest<IReadOnlyList<ModulePackageDto>>;

public sealed class ListModulePackagesQueryHandler(IModulePackageStore store)
    : IRequestHandler<ListModulePackagesQuery, IReadOnlyList<ModulePackageDto>>
{
    public async Task<IReadOnlyList<ModulePackageDto>> Handle(ListModulePackagesQuery request, CancellationToken cancellationToken)
        => (await store.ListAsync(cancellationToken))
            .Where(p => request.Target is null || p.Target == request.Target)
            .OrderBy(p => p.Name).ThenByDescending(p => p.UploadedUtc)
            .Select(p => p.ToDto(store)).ToList();
}

public sealed record GetModulePackageQuery(string Id) : IRequest<ModulePackageDto>;

public sealed class GetModulePackageQueryHandler(IModulePackageStore store) : IRequestHandler<GetModulePackageQuery, ModulePackageDto>
{
    public async Task<ModulePackageDto> Handle(GetModulePackageQuery request, CancellationToken cancellationToken)
        => (await store.GetAsync(request.Id, cancellationToken)).ToDto(store);
}

public sealed record DownloadModulePackageQuery(string Id) : IRequest<ModulePackageFile>;

public sealed class DownloadModulePackageQueryHandler(IModulePackageStore store) : IRequestHandler<DownloadModulePackageQuery, ModulePackageFile>
{
    public async Task<ModulePackageFile> Handle(DownloadModulePackageQuery request, CancellationToken cancellationToken)
    {
        var package = await store.GetAsync(request.Id, cancellationToken);
        var type = package.Kind == ModuleKind.NuPkg ? "application/octet-stream" : "application/x-msdownload";
        return new ModulePackageFile(store.OpenRead(package), package.FileName, type);
    }
}

// ---- enable / configure / delete
public sealed record SetModulePackageEnabledCommand(string Id, bool Enabled) : IRequest<ModulePackageDto>;

public sealed class SetModulePackageEnabledCommandHandler(IModulePackageStore store)
    : IRequestHandler<SetModulePackageEnabledCommand, ModulePackageDto>
{
    public async Task<ModulePackageDto> Handle(SetModulePackageEnabledCommand request, CancellationToken cancellationToken)
    {
        var package = await store.GetAsync(request.Id, cancellationToken);

        if (request.Enabled && package.Target == ModuleTarget.Host)
        {
            // Two enabled versions of one package cannot both be referenced by the build.
            var clash = (await store.ListAsync(cancellationToken))
                .FirstOrDefault(p => p.Id != package.Id && p.Enabled && p.Target == ModuleTarget.Host
                                     && string.Equals(p.PackageId, package.PackageId, StringComparison.OrdinalIgnoreCase));
            if (clash is not null)
                throw new ConflictException($"Version {clash.Version} of '{clash.PackageId}' is enabled; disable it first.");
        }

        package.Enabled = request.Enabled;
        await store.UpdateAsync(package, cancellationToken);
        return package.ToDto(store);
    }
}

public sealed record SetModulePackageConfigurationCommand(string Id, string? Configuration) : IRequest<ModulePackageDto>;

public sealed class SetModulePackageConfigurationCommandValidator : AbstractValidator<SetModulePackageConfigurationCommand>
{
    public SetModulePackageConfigurationCommandValidator()
        => RuleFor(c => c.Configuration)
            .Must(json => string.IsNullOrWhiteSpace(json) || IsJsonObject(json))
            .WithMessage("Configuration must be a JSON object.");

    private static bool IsJsonObject(string json)
    {
        try { using var doc = JsonDocument.Parse(json); return doc.RootElement.ValueKind == JsonValueKind.Object; }
        catch (JsonException) { return false; }
    }
}

public sealed class SetModulePackageConfigurationCommandHandler(IModulePackageStore store)
    : IRequestHandler<SetModulePackageConfigurationCommand, ModulePackageDto>
{
    public async Task<ModulePackageDto> Handle(SetModulePackageConfigurationCommand request, CancellationToken cancellationToken)
    {
        var package = await store.GetAsync(request.Id, cancellationToken);
        package.Configuration = string.IsNullOrWhiteSpace(request.Configuration) ? null : request.Configuration;
        await store.UpdateAsync(package, cancellationToken);
        return package.ToDto(store);
    }
}

public sealed record DeleteModulePackageCommand(string Id) : IRequest;

public sealed class DeleteModulePackageCommandHandler(IModulePackageStore store) : IRequestHandler<DeleteModulePackageCommand>
{
    public async Task Handle(DeleteModulePackageCommand request, CancellationToken cancellationToken)
    {
        await store.GetAsync(request.Id, cancellationToken);
        await store.DeleteAsync(request.Id, cancellationToken);
    }
}
