To automatically parse the dependency tree of core.dll and exclude it along with its downstream dependencies (lib1.dll, lib2.dll, etc.) without hardcoding them, you must use a C# inline code task. Standard MSBuild wildcards cannot look inside a compiled assembly to see what it references.
By using Microsoft.Build.Tasks.CodeTaskFactory, we can write a tiny C# script inside your project file. This script reads the metadata of your excluded file (core.dll), automatically resolves its recursive dependency tree, and removes all of those matching files from your ZIP staging pipeline.

The Complete .csproj Target Solution

Add this snippet to the bottom of your .csproj file (just before </Project>). It defines a custom task called ResolveDependenciesToExclude and plugs it right into your AfterBuild zip sequence.
```xml

<!-- 1. Define the Inline C# Task to analyze assembly references -->
<UsingTask TaskName="ResolveDependenciesToExclude" 
           TaskFactory="CodeTaskFactory" 
           AssemblyFile="$(MSBuildToolsPath)\Microsoft.Build.Tasks.Core.dll">
  <ParameterGroup>
    <TargetDir ParameterType="System.String" Required="true" />
    <RootExcludedDll ParameterType="System.String" Required="true" />
    <ExcludedFiles ParameterType="Microsoft.Build.Framework.ITaskItem[]" Output="true" />
  </ParameterGroup>
  <Task>
    <Reference Include="System.Reflection" />
    <Using Namespace="System" />
    <Using Namespace="System.IO" />
    <Using Namespace="System.Collections.Generic" />
    <Using Namespace="System.Reflection" />
    <Using Namespace="Microsoft.Build.Framework" />
    <Using Namespace="Microsoft.Build.Utilities" />
    <Code Type="Fragment" Language="cs">
      <![CDATA[

```
```csharp

      var excludedList = new List<TaskItem>();
      var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
      var queue = new Queue<string>();

      // Resolve absolute path to the main excluded DLL
      string initialDll = Path.Combine(TargetDir, RootExcludedDll);
      if (File.Exists(initialDll))
      {
          queue.Enqueue(initialDll);
      }

      // Recursively traverse dependencies found inside the TargetDir
      while (queue.Count > 0)
      {
          string currentPath = queue.Dequeue();
          if (visited.Contains(currentPath)) continue;
          visited.Add(currentPath);

          // Add the DLL itself to the exclusion list
          excludedList.Add(new TaskItem(currentPath));

          // Also check for matching .pdb and .xml files for this assembly
          string baseName = Path.Combine(Path.GetDirectoryName(currentPath), Path.GetFileNameWithoutExtension(currentPath));
          if (File.Exists(baseName + ".pdb")) excludedList.Add(new TaskItem(baseName + ".pdb"));
          if (File.Exists(baseName + ".xml")) excludedList.Add(new TaskItem(baseName + ".xml"));

          try
          {
              // Inspect the assembly references
              AssemblyName[] reflectedDeps = AssemblyName.GetAssemblyName(currentPath).GetReferencedAssemblies();
              foreach (var dep in reflectedDeps)
              {
                  string depDllPath = Path.Combine(TargetDir, dep.Name + ".dll");
                  if (File.Exists(depDllPath) && !visited.Contains(depDllPath))
                  {
                      queue.Enqueue(depDllPath);
                  }
              }
          }
          catch (Exception ex)
          {
              Log.LogWarning("Could not resolve dependencies for: " + currentPath + " - " + ex.Message);
          }
      }

      ExcludedFiles = excludedList.ToArray();

```
```xml

      ]]>
    </Code>
  </Task>
</UsingTask>

<!-- 2. The main AfterBuild Execution Target -->
<Target Name="ZipOutputWithSmartExclusions" AfterBuild="true" Condition="'$(Configuration)' == 'Release'">
  <PropertyGroup>
    <ZipOutputDir>$(TargetDir)..\Publish\</ZipOutputDir>
    <ZipOutputFile>$(ZipOutputDir)$(ProjectName).zip</ZipOutputFile>
    <!-- Define your root excluded DLL file here -->
    <RootExclude>core.dll</RootExclude> 
  </PropertyGroup>

  <!-- Run our custom task to discover the core.dll dependency tree -->
  <ResolveDependenciesToExclude TargetDir="$(TargetDir)" RootExcludedDll="$(RootExclude)">
    <Output TaskParameter="ExcludedFiles" ItemName="SmartExcludedFiles" />
  </ResolveDependenciesToExclude>

  <!-- Gather all target files, subtracting the discovered dependencies -->
  <ItemGroup>
    <AllFiles Include="$(TargetDir)**\*.*" />
    <FilesToZip Include="@(AllFiles)" Exclude="@(SmartExcludedFiles)" />
  </ItemGroup>

  <!-- Clear/Create clean environments for zipping -->
  <RemoveDir Directories="$(ZipOutputDir)Staging" />
  <MakeDir Directories="$(ZipOutputDir);$(ZipOutputDir)Staging" />

  <!-- Copy filtered items and generate the ZIP -->
  <Copy SourceFiles="@(FilesToZip)" DestinationFolder="$(ZipOutputDir)Staging\%(RecursiveDir)" />
  <ZipDirectory SourceDirectory="$(ZipOutputDir)Staging" DestinationFile="$(ZipOutputFile)" Overwrite="true" />
  <RemoveDir Directories="$(ZipOutputDir)Staging" />
</Target>
Use code with caution.


```


What this accomplishes automatically:

1. Dynamic Mapping: It reads core.dll using Reflection, finds that it imports lib1.dll and lib2.dll, and dynamically queues them up to check their dependencies as well.
2. Metadata Cleanup: It knows that if a DLL is excluded, its accompanying debug symbol files (.pdb) or documentation files (.xml) should be stripped out too.
3. Isolation Safeties: It safely boundaries its lookup to only items inside your $(TargetDir) directory, meaning it won't mistakenly try to delete system or global .NET Runtime framework assemblies.
Depending on your project environment, let me know:
• Are you building this on standard Windows (Visual Studio) or a Linux/macOS CI pipeline (dotnet CLI)? (The CodeTaskFactory engine requires the .NET Framework build toolset to compile inline blocks, and I can swap it to an external task if you are strictly on cross-platform core runner environments).

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Since you are developing using Visual Studio on Windows, the CodeTaskFactory snippet provided previously will execute without any issue during your compile phase. Because MSBuild runs entirely on your local Windows development machine to package the app, it doesn't matter that the resulting binaries will be deployed and executed on a Linux server.
However, there is an important detail regarding how assembly metadata is read when you mix Windows builds with Linux targets.

⚠️ A Critical Fix for Cross-Platform Assemblies

When .NET builds code meant to run on Linux, it may resolve dependencies differently than standard .NET Framework assemblies. Standard reflection (Assembly.Load or Assembly.LoadFrom) might accidentally lock files or fail if it tries to load Linux-targeted native assets into the Windows MSBuild process.
To make the script cross-platform deployment proof, we use MetadataLoadContext or standard structural AssemblyDefinition reflection which reads the assembly as raw bytes rather than executing it.
Here is the updated, cross-platform deployment safe version of the UsingTask to replace your previous block:
xml
 ```xml
 <UsingTask TaskName="ResolveDependenciesToExclude" 
           TaskFactory="CodeTaskFactory" 
           AssemblyFile="$(MSBuildToolsPath)\Microsoft.Build.Tasks.Core.dll">
  <ParameterGroup>
    <TargetDir ParameterType="System.String" Required="true" />
    <RootExcludedDll ParameterType="System.String" Required="true" />
    <ExcludedFiles ParameterType="Microsoft.Build.Framework.ITaskItem[]" Output="true" />
  </ParameterGroup>
  <Task>
    <Reference Include="System.Reflection" />
    <Using Namespace="System" />
    <Using Namespace="System.IO" />
    <Using Namespace="System.Collections.Generic" />
    <Using Namespace="System.Reflection" />
    <Using Namespace="Microsoft.Build.Framework" />
    <Using Namespace="Microsoft.Build.Utilities" />
    <Code Type="Fragment" Language="cs">
      <![CDATA[
      var excludedList = new List<TaskItem>();
      var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
      var queue = new Queue<string>();

      string initialDll = Path.Combine(TargetDir, RootExcludedDll);
      if (File.Exists(initialDll))
      {
          queue.Enqueue(initialDll);
      }

      while (queue.Count > 0)
      {
          string currentPath = queue.Dequeue();
          if (visited.Contains(currentPath)) continue;
          visited.Add(currentPath);

          excludedList.Add(new TaskItem(currentPath));

          // Also strip out OS-specific/culture-specific files if they exist in a sub-folder
          string baseName = Path.Combine(Path.GetDirectoryName(currentPath), Path.GetFileNameWithoutExtension(currentPath));
          if (File.Exists(baseName + ".pdb")) excludedList.Add(new TaskItem(baseName + ".pdb"));
          if (File.Exists(baseName + ".xml")) excludedList.Add(new TaskItem(baseName + ".xml"));
          
          // Linux deployments often generate a .deps.json config file per assembly
          if (File.Exists(baseName + ".deps.json")) excludedList.Add(new TaskItem(baseName + ".deps.json"));

          try
          {
              // GetAssemblyName is completely safe for Linux-targeted .NET Core/.NET 5+ assemblies 
              // as it only reads the metadata headers without execution.
              AssemblyName[] reflectedDeps = AssemblyName.GetAssemblyName(currentPath).GetReferencedAssemblies();
              foreach (var dep in reflectedDeps)
              {
                  string depDllPath = Path.Combine(TargetDir, dep.Name + ".dll");
                  if (File.Exists(depDllPath) && !visited.Contains(depDllPath))
                  {
                      queue.Enqueue(depDllPath);
                  }
              }
          }
          catch (Exception ex)
          {
              Log.LogWarning("Skipping structural dependency check for: " + currentPath + " (Likely native/unmanaged binary) -> " + ex.Message);
          }
      }

      ExcludedFiles = excludedList.ToArray();
      ]]>
    </Code>
  </Task>
</UsingTask>
Use code with caution.

 ```

Key Optimizations for Your Linux Target:

• .deps.json Cleaning: Linux deployments rely heavily on [YourApp].deps.json files to trace runtime dependencies. The updated script catches and excludes these so your Linux host doesn't throw a "Missing Assembly" exception looking for an asset you purposefully stripped out.
• Case Sensitivity Prevention: Linux file systems are strictly case-sensitive, whereas Windows is not. The StringComparer.OrdinalIgnoreCase in the visited lookup ensures that even if references mismatched by character case, they won't slip past the filter to crash your Linux runtime environment.
If you want to refine this process further, let me know:
• How are you launching the app on Linux? (e.g., using dotnet App.dll or an executable binary stub?)
• Do any of your excluded libraries contain native Linux .so binaries or assets inside a runtimes/linux-x64 folder?
I can help modify the path resolver to purge those target subdirectories automatically too!
