using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Client.Services;

/// <summary>What a module file contains once opened: assembly images plus its static files.</summary>
public sealed record ModulePackage(IReadOnlyList<byte[]> Assemblies, ModuleAssetSet Assets);

/// <summary>
/// Strategy: one reader per module kind. Adding a new packaging format means adding a reader and registering
/// it in DI; ModuleManager never branches on ModuleKind.
/// </summary>
public interface IModulePackageReader
{
  ModuleKind Kind { get; }

  /// <param name="primary">The already downloaded (and verified) main file.</param>
  /// <param name="downloadAssembly">Fetches an extra assembly by url.</param>
  Task<ModulePackage> ReadAsync(ModuleDescriptor descriptor, byte[] primary, Func<string, Task<byte[]>> downloadAssembly);
}

/// <summary>A single assembly (plus optional private assemblies). Static files come from its embedded resources.</summary>
public sealed class DllPackageReader : IModulePackageReader
{
  public ModuleKind Kind => ModuleKind.Dll;

  public async Task<ModulePackage> ReadAsync(ModuleDescriptor d, byte[] primary, Func<string, Task<byte[]>> downloadAssembly)
  {
    var images = new List<byte[]> { primary };
    foreach (var extra in d.ExtraAssemblies) images.Add(await downloadAssembly(extra));

    var assets = new ModuleAssetSet();
    foreach (var image in images) EmbeddedAssetReader.ReadInto(image, assets);

    return new ModulePackage(images, assets);
  }
}

/// <summary>A NuGet package: lib/&lt;tfm&gt;/*.dll plus staticwebassets/*, plus anything embedded in the assemblies.</summary>
public sealed class NuPkgPackageReader : IModulePackageReader
{
  public ModuleKind Kind => ModuleKind.NuPkg;

  public Task<ModulePackage> ReadAsync(ModuleDescriptor d, byte[] primary, Func<string, Task<byte[]>> downloadAssembly)
  {
    var package = NuPkgReader.Read(primary);

    var assets = new ModuleAssetSet();
    foreach (var image in package.Assemblies) EmbeddedAssetReader.ReadInto(image, assets);
    foreach (var (path, content) in package.StaticAssets) assets.Set(path, content); // the package's files win

    return Task.FromResult(new ModulePackage(package.Assemblies, assets));
  }
}

/// <summary>
/// Reads the static files a module embeds in its own assembly (see modules/client/Directory.Build.targets: every file
/// under wwwroot becomes a resource named "module-assets/&lt;path&gt;"). The assembly is only inspected with
/// System.Reflection.Metadata - never loaded - so reading assets cannot make the loader think the DLL is already present.
/// </summary>
internal static class EmbeddedAssetReader
{
  public const string ResourcePrefix = "module-assets/";

  public static void ReadInto(byte[] image, ModuleAssetSet assets)
  {
    using var pe = new PEReader(new MemoryStream(image));
    if (!pe.HasMetadata) return;

    var cor = pe.PEHeaders.CorHeader;
    if (cor is null || cor.ResourcesDirectory.Size == 0) return;

    var metadata = pe.GetMetadataReader();
    var block = pe.GetSectionData(cor.ResourcesDirectory.RelativeVirtualAddress);

    foreach (var handle in metadata.ManifestResources)
    {
      var resource = metadata.GetManifestResource(handle);
      if (!resource.Implementation.IsNil) continue; // lives in another file, not in this assembly

      var name = metadata.GetString(resource.Name);
      if (!name.StartsWith(ResourcePrefix, StringComparison.OrdinalIgnoreCase)) continue;

      var offset = (int)resource.Offset;
      var reader = block.GetReader(offset, block.Length - offset);
      var length = reader.ReadInt32(); // resources are length-prefixed
      assets.Set(name[ResourcePrefix.Length..], reader.ReadBytes(length));
    }
  }
}
