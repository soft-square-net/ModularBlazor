
using System.Reflection;
using System.Text.Json;
using Microsoft.JSInterop;

namespace soft.square.net.ModularBlazor.Abstractions.ScriptManager;

public static class BlazorScriptInjector
{
    public static async ValueTask InjectScriptAsync(this IJSRuntime js, string scriptUrl, bool head = false, bool async = false)
    {
        var jsCode = $$"""
            (url, head=false, async=false) => {
                if (document.querySelector(`script[src='${url}']`)) return;
                const script = document.createElement('script');
                script.src = url;
                script.async = async;
                if (head) {
                    document.head.appendChild(script);
                } else {
                    document.body.appendChild(script);
                }
            }
            """;
            

        await js.InvokeVoidAsync("eval", $"({jsCode})('{scriptUrl}', '{head.ToString().ToLower()}', '{async.ToString().ToLower()}')");
    }


    public static async ValueTask InjectScriptPromiseAsync(this IJSRuntime js, string scriptUrl, bool head = false, bool async = false)
    {
        // Calling the window helper function directly passes the promise handler straight to Blazor's engine
        await js.InvokeVoidAsync("window.helpers.loadScriptWithPromise", scriptUrl, head, async);
    }



    public static async ValueTask InjectStyleSheetAsync(this IJSRuntime js, string styleUrl)
    {
        var jsCode = $$"""
            (url) => {
                if (document.querySelector(`link[href='${url}']`)) return;
                const style = document.createElement('link');
                style.rel = 'stylesheet';
                style.href = url;
                document.head.appendChild(style);
            }
            """;


        await js.InvokeVoidAsync("eval", $"({jsCode})('{styleUrl}')");
    }

    public static async Task<IJSObjectReference?> LoadAssemblyScript(this IJSRuntime js, Assembly rclAssembly, string path, string? sourcesPath = "")
    {
        try
        {
            // 1. Locate the currently loaded assembly context
            //Assembly rclAssembly = AppDomain.CurrentDomain.GetAssemblies()
            //    .First(a => a.GetName().Name == Constants.AssemblyFullName);
            // 2. Read the embedded JavaScript raw string out of the reflected DLL binary
            string rawJsContent = RclAssetReader.GetEmbeddedScript(rclAssembly, path);


            string scriptFileName = Path.GetFileName(path);

            // 3. SECURE FIX: Append the special DevTools identifier comment to the bottom of the script
            // This tells Chrome to register it as a physical file under a virtual directory structure.
            sourcesPath = string.IsNullOrWhiteSpace(sourcesPath) ? "_content/" + rclAssembly.ManifestModule.ScopeName.Replace(".dll","") : sourcesPath;
            sourcesPath = "\n\n//# sourceURL=" + sourcesPath + "/" + scriptFileName;

            string processableJs = rawJsContent + sourcesPath;

            // 4. Pass the modified content string into the Blob constructor
            string virtualFileAssetUrl = await js.InvokeAsync<string>("eval", $@"
                ((scriptText) => {{
                    const blob = new Blob([scriptText], {{ type: 'text/javascript' }});
                    return URL.createObjectURL(blob);
                }})({JsonSerializer.Serialize(processableJs)})
            ");

            // 5. Import the virtual path cleanly as an isolated module
            // IJSObjectReference? _module = await JS.InvokeAsync<IJSObjectReference>("import", blobUrl);
            var module = await js.InvokeAsync<IJSObjectReference>("import", virtualFileAssetUrl);

            // 6. Clean up the pointer mapping
            await js.InvokeVoidAsync("URL.revokeObjectURL", virtualFileAssetUrl);
            return module;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to resolve reflection script: {ex.Message}");
            return null;
        }
    }



}
