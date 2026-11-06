
using System;
using System.IO;
using System.Reflection;

namespace soft.square.net.ModularBlazor.Abstractions.ScriptManager;


public static class RclAssetReader
{
    /// <summary>
    /// Reads the raw text content of a file embedded inside a reflected assembly.
    /// </summary>
    /// <param name="rclAssembly">The Assembly instance loaded via reflection.</param>
    /// <param name="relativePath">The path within the project (e.g., "wwwroot/js/gridEditor.js")</param>
    public static string GetEmbeddedScript(Assembly rclAssembly, string relativePath)
    {
        if (rclAssembly == null)
            throw new ArgumentNullException(nameof(rclAssembly));

        // 1. Convert path separators to standard dot notation used by manifest resources.
        // Example: "wwwroot/js/gridEditor.js" becomes "wwwroot.js.gridEditor.js"
        string resourcePathDotNotation = relativePath.Replace("/", ".");

        // 2. Build the full compiled resource name string matching AssemblyName.ResourcePath
        string resourceName = $"{rclAssembly.GetName().Name}.{resourcePathDotNotation}";

        // 3. Open the binary stream from the reflected metadata context
        using Stream? stream = rclAssembly.GetManifestResourceStream(resourceName);
        if (stream == null)
        {
            // Helpful Debugging: List out all available assets inside the DLL if it fails to find yours
            string[] availableResources = rclAssembly.GetManifestResourceNames();
            string availableListList = string.Join(", ", availableResources);

            throw new FileNotFoundException(
                $"Could not find embedded resource: '{resourceName}'.\n" +
                $"Make sure the file build action is set to 'EmbeddedResource'.\n" +
                $"Available resources in this assembly: [{availableListList}]");
        }

        // 4. Stream and translate the binary contents back into a standard text string
        using StreamReader reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
