using System.Text.Json;
using System.Text.Json.Serialization;

namespace soft.square.net.WebApi.Modularity;

[JsonConverter(typeof(JsonStringEnumConverter<ModuleState>))]
public enum ModuleState
{
    /// <summary>Package stored and manifest registered; nothing loaded.</summary>
    Installed,
    /// <summary>Desired state: loaded, services built, routes live. Restored on startup.</summary>
    Active,
    /// <summary>Routes removed; the assembly may still be loaded until it is unloaded.</summary>
    Inactive
}

/// <summary>One row of the module store. Stand-in for the modules schema table (Catalog) in the real host.</summary>
public sealed class ModuleRecord
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Version { get; init; }
    public required string RoutePrefix { get; init; }
    public string? Description { get; init; }

    /// <summary>File name of the assembly that holds the IRuntimeModule, relative to the package folder.</summary>
    public required string EntryAssembly { get; init; }

    public Dictionary<string, string?> Settings { get; set; } = new();
    public ModuleState DesiredState { get; set; }
    public DateTimeOffset InstalledAt { get; init; }
}

public sealed record ModuleStatus(ModuleRecord Module, bool Loaded, IReadOnlyList<string> Routes);

public sealed record UnloadResult(string Id, bool Unloaded, int GcPasses, string? Note);

/// <summary>Persists the module records as JSON next to the packages.</summary>
internal sealed class ModuleRegistryStore(string path)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public IEnumerable<ModuleRecord> Load() =>
        File.Exists(path) ? JsonSerializer.Deserialize<List<ModuleRecord>>(File.ReadAllText(path), Json) ?? [] : [];

    public void Save(IEnumerable<ModuleRecord> records)
    {
        var temp = path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(records.OrderBy(r => r.Id).ToList(), Json));
        File.Move(temp, path, overwrite: true);
    }
}

public sealed class ModuleException(string message, int statusCode = StatusCodes.Status400BadRequest) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
