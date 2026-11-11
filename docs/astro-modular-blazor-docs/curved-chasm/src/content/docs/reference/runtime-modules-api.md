---
title: Runtime modules API
description: Admin endpoints, manifest fields and packaging rules for modules loaded while the API runs.
sidebar:
  order: 3
---

The runtime module prototype lives in `src/WebApi`. How it works: [Runtime modules](/backend/runtime-modules/).

## Admin endpoints

| Method and path | Does |
| --- | --- |
| `GET /api/admin/modules` | Lists registered modules: desired state, loaded or not, live routes |
| `POST /api/admin/modules` | **Install**: multipart form field `package` with a `.dll`, `.zip` or `.nupkg` |
| `POST /api/admin/modules/{id}/activate` | Load if needed, build services, map routes |
| `POST /api/admin/modules/{id}/deactivate` | Remove routes; the module stays loaded |
| `POST /api/admin/modules/{id}/unload` | Remove routes, dispose services, unload assemblies |
| `PUT /api/admin/modules/{id}/settings` | Replace settings (JSON object); applied on the next load |
| `DELETE /api/admin/modules/{id}` | Unload, delete the package, remove the registration |
| `GET /api/admin/modules/unloading` | Unloaded modules whose memory is not freed yet |

Errors are problem details: `400` for an invalid package or manifest, `404` for an unknown module, `409` when a
module is still loaded or its route prefix is taken.

Module endpoints are served under `/api/{RoutePrefix}`.

## States

| State | Meaning | Restored on startup |
| --- | --- | --- |
| `Installed` | Package stored, manifest registered, nothing loaded | No |
| `Active` | Loaded, services built, routes live | Yes, activated again |
| `Inactive` | Routes removed; may still be loaded until unloaded | No |

## Contract

```csharp
public interface IRuntimeModule
{
    ModuleManifest Manifest { get; }
    void ConfigureServices(IServiceCollection services, IConfiguration settings);
}

public sealed record ModuleManifest(string Id, string Name, string Version, string RoutePrefix)
{
    public string? Description { get; init; }
    public IReadOnlyDictionary<string, string?> DefaultSettings { get; init; }
}
```

| Field | Rule |
| --- | --- |
| `Id` | Lowercase `a-z`, `0-9`, `.`, `-`; stable across versions |
| `Version` | Letters, digits, `.`, `+`, `-` |
| `RoutePrefix` | Same rule as `Id`; unique among installed modules |
| `DefaultSettings` | Flat configuration keys (`Section:Key`); copied into the registration on install |

A package contains **exactly one** public, non-abstract `IRuntimeModule` with a parameterless constructor.
Endpoints come from its `ICarterModule` classes. Keyed services are not supported yet.

## Packaging a module

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- Copies private dependencies to the output and writes the .deps.json the loader uses. -->
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <!-- Shared with the host: compile against them, never ship them. -->
    <PackageReference Include="Carter" Version="10.0.0" ExcludeAssets="runtime" />
    <ProjectReference Include="..\WebApi.Contracts\WebApi.Contracts.csproj" Private="false" ExcludeAssets="runtime" />
    <!-- Private dependency: loads into the module's own load context. -->
    <PackageReference Include="Humanizer.Core" Version="2.14.1" />
  </ItemGroup>
</Project>
```

| Package form | Contents |
| --- | --- |
| `.zip` (recommended) | The **contents** of `bin/<Configuration>/net10.0`: module dll, `.deps.json`, private dependencies |
| `.dll` | The module assembly alone; only for modules without private dependencies |
| `.nupkg` | `lib/<highest netX.Y>/` is used; package dependencies are **not** restored |

If the host already ships an assembly with the same name, the host's copy is used, whatever version the module
was built against.

## Try it

```bash
dotnet build src/WebApi.Modules.Greeting
dotnet run --project src/WebApi --launch-profile http
```

Zip the contents of `src/WebApi.Modules.Greeting/bin/Debug/net10.0` as `greeting.zip`, then:

```bash
curl -F "package=@greeting.zip" http://localhost:5298/api/admin/modules
curl -X POST http://localhost:5298/api/admin/modules/greeting/activate
curl http://localhost:5298/api/greeting/john_doe
```

`src/WebApi/WebApi.http` has every request.
