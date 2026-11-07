using System.IO.Compression;

namespace soft.square.net.ModularBlazor.Client.Services;

internal sealed record NuPkgContent(
    IReadOnlyList<byte[]> Assemblies,
    IReadOnlyDictionary<string, byte[]> StaticAssets);

/// <summary>Reads a .nupkg (a zip) fully in memory.</summary>
internal static class NuPkgReader
{
    // The first target framework found in the package wins.
    private static readonly string[] TfmPreference =
        ["net10.0", "net9.0", "net8.0", "net7.0", "net6.0", "netstandard2.1", "netstandard2.0"];

    private const string StaticAssetsPrefix = "staticwebassets/";

    public static NuPkgContent Read(byte[] package)
    {
        using var zip = new ZipArchive(new MemoryStream(package), ZipArchiveMode.Read);

        // lib/<tfm>/<name>.dll  (satellite/resource assemblies sit deeper and are ignored)
        var libs = zip.Entries
            .Select(e => (Entry: e, Parts: e.FullName.Split('/')))
            .Where(x => x.Parts.Length == 3
                        && x.Parts[0].Equals("lib", StringComparison.OrdinalIgnoreCase)
                        && x.Parts[2].EndsWith(".dll", StringComparison.OrdinalIgnoreCase)
                        && !x.Parts[2].EndsWith(".resources.dll", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var tfm = TfmPreference.FirstOrDefault(t => libs.Any(l => l.Parts[1].Equals(t, StringComparison.OrdinalIgnoreCase)))
                  ?? throw new InvalidOperationException("The package has no lib/<tfm>/*.dll this app can use.");

        var assemblies = libs
            .Where(l => l.Parts[1].Equals(tfm, StringComparison.OrdinalIgnoreCase))
            .Select(l => ReadAll(l.Entry))
            .ToList();

        // Razor class library assets: staticwebassets/<path relative to wwwroot>
        var statics = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
        foreach (var e in zip.Entries)
        {
            if (e.FullName.StartsWith(StaticAssetsPrefix, StringComparison.OrdinalIgnoreCase)
                && !e.FullName.EndsWith('/')
                && !e.FullName.EndsWith(".map", StringComparison.OrdinalIgnoreCase))
            {
                statics[e.FullName[StaticAssetsPrefix.Length..]] = ReadAll(e);
            }
        }

        return new NuPkgContent(assemblies, statics);
    }

    private static byte[] ReadAll(ZipArchiveEntry entry)
    {
        using var s = entry.Open();
        using var ms = new MemoryStream();
        s.CopyTo(ms);
        return ms.ToArray();
    }
}
