
// Inside your RCL: NodeModuleInterop.cs
using Microsoft.JSInterop;

namespace soft.square.net.ModularBlazor.Client.Services;


public class NodeModuleInterop : IAsyncDisposable
{
  private readonly IJSRuntime _jsRuntime;
  private IJSObjectReference? _module;

  public NodeModuleInterop(IJSRuntime jsRuntime)
  {
    _jsRuntime = jsRuntime;
  }

  public async Task EnsureInitializedAsync()
  {
    if (_module == null)
    {
      // Blazor routes RCL static assets to _content/[Assembly_Name]/
      _module = await _jsRuntime.InvokeAsync<IJSObjectReference>(
          "import", "./_content/YourRclAssemblyName/nodeInterop.js");

      // Execute the once-off Node initialization function
      await _module.InvokeVoidAsync("initializeNodeModule");
    }
  }

  public async Task<string> CallNodeAction(string data)
  {
    await EnsureInitializedAsync();
    return await _module!.InvokeAsync<string>("performAction", data);
  }

  public async ValueTask DisposeAsync()
  {
    if (_module != null)
    {
      await _module.DisposeAsync();
    }
  }
}
