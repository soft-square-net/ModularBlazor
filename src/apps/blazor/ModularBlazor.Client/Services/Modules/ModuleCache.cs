using Microsoft.JSInterop;

namespace soft.square.net.ModularBlazor.Client.Services;

/// <summary>
/// Persistent cache for module files and the core manifest (browser Cache Storage, see wwwroot/moduleCache.js).
/// Best effort: every failure reads as a cache miss.
/// </summary>
public sealed class ModuleCache(IJSRuntime js)
{
  public async Task<byte[]?> GetAsync(string key)
  {
    try { return await js.InvokeAsync<byte[]?>("moduleCache.get", key); }
    catch (JSException) { return null; }
  }

  public async Task PutAsync(string key, byte[] bytes)
  {
    try { await js.InvokeVoidAsync("moduleCache.put", key, bytes); }
    catch (JSException) { /* not cached */ }
  }

  public async Task RemovePrefixAsync(string prefix)
  {
    try { await js.InvokeVoidAsync("moduleCache.removePrefix", prefix); }
    catch (JSException) { }
  }
}
