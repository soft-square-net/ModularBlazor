using Microsoft.JSInterop;

namespace soft.square.net.ModularBlazor.Abstractions.MudTail;

/// <summary>
/// MudTail's Blazor interop (create, toast, behavior, ...), shared by every module. The Layouts.Default client module
/// bundles it into its js/module.js; when the module is activated, moduleHost keeps the object that script returns, and
/// <c>moduleHost.get('Layouts.Default')</c> hands it out. Layouts.Default loads on startup and stays active, so the host's
/// own pages and every module use the same runtime, theme and styles (css/main.min.css). The host registers it (scoped);
/// modules inject it, or use <see cref="MudTailDataTable"/>.
/// </summary>
public sealed class MudTailRuntime(IJSRuntime js)
{
    public const string ProviderModule = "Layouts.Default";

    private IJSObjectReference? _runtime;

    /// <summary>The runtime, or null when Layouts.Default is not active (it failed to load).</summary>
    public async ValueTask<IJSObjectReference?> GetAsync()
    {
        if (_runtime is not null) return _runtime;
        if (!await js.InvokeAsync<bool>("moduleHost.isActive", ProviderModule)) return null;
        return _runtime = await js.InvokeAsync<IJSObjectReference?>("moduleHost.get", ProviderModule);
    }

    /// <summary>A MudTail toast: type is "info", "success", "warning" or "error". Falls back to the console.</summary>
    public async ValueTask ToastAsync(string message, string type = "info")
    {
        if (await GetAsync() is { } runtime) await runtime.InvokeVoidAsync("toast", message, type);
        else Console.WriteLine($"[{type}] {message}");
    }

    /// <summary>Attaches a data-mud behaviour (e.g. "password-toggle", "ripple") to an element Blazor rendered.</summary>
    public async ValueTask<IJSObjectReference?> BehaviorAsync(string name, Microsoft.AspNetCore.Components.ElementReference element)
        => await GetAsync() is { } runtime ? await runtime.InvokeAsync<IJSObjectReference?>("behavior", name, element) : null;
}
