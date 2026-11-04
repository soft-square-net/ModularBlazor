# 1. Find the .slnx file in the current directory
$slnxFile = Get-ChildItem -Filter *.slnx | Select-Object -First 1

if ($null -eq $slnxFile) {
    Write-Error "No .slnx solution file found in the current directory."
    return
}

# 2. Extract relative project paths from the .slnx XML structure
[xml]$slnxXml = Get-Content -Path $slnxFile.FullName
$projects = $slnxXml.Solution.Project | Where-Object { $_.Path -like "*.csproj" }

# 3. Setup the final output file path
$outputFile = Join-Path $slnxFile.DirectoryName "solution_context_dump.txt"
$report = [System.Text.StringBuilder]::new()

# Extract the name cleanly as a primitive string to avoid expression issues
$slnxName = $slnxFile.Name

$report.AppendLine("================================================================================")
$report.AppendLine("SOLUTION TEXT DUMP: $slnxName")
$report.AppendLine("Generated on: $(Get-Date)")
$report.AppendLine("================================================================================")
$report.AppendLine()

# 4. Iterate through each discovered project
foreach ($proj in $projects) {
    # Resolve the absolute path of the project file and its directory
    $absoluteProjPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($slnxFile.DirectoryName, $proj.Path))
    $projDir = [System.IO.Path]::GetDirectoryName($absoluteProjPath)
    $projName = [System.IO.Path]::GetFileNameWithoutExtension($absoluteProjPath)

    if (-not (Test-Path $projDir)) { continue }

    $report.AppendLine("--------------------------------------------------------------------------------")
    $report.AppendLine("PROJECT: $projName")
    $report.AppendLine("Path: $absoluteProjPath")
    $report.AppendLine("--------------------------------------------------------------------------------")
    $report.AppendLine()

    # --- PART A: Generate a Visual Directory Tree Structure ---
    $report.AppendLine("--- Visual Project Structure ---")
    
    # Gather relevant application files, excluding common build noise directories
    $files = Get-ChildItem -Path $projDir -Recurse -File | Where-Object {
        $_.FullName -notlike "*\obj\*" -and 
        $_.FullName -notlike "*\bin\*" -and 
        $_.FullName -notlike "*\.git\*" -and
        $_.FullName -notlike "*\.vs\*"
    }

    foreach ($file in $files) {
        # Calculate the display path relative to the project root directory
        $relativePath = $file.FullName.Substring($projDir.Length + 1)
        $segments = $relativePath.Split([System.IO.Path]::DirectorySeparatorChar)
        $indent = "    " * ($segments.Count - 1)
        $report.AppendLine("${indent}└── $($segments[-1])")
    }
    
    $report.AppendLine()

    # --- PART B: Dump File Contents ---
    $report.AppendLine("--- Project File Contents ---")
    $report.AppendLine()

    # Targets key application files, Blazor components, and Elsa/Scalar configurations
    $sourceFiles = Get-ChildItem -Path $projDir -Recurse -File -Include "*.cs", "*.razor", "*.cshtml", "appsettings.json", "*.json" | 
        Where-Object { 
            $_.FullName -notlike "*\obj\*" -and 
            $_.FullName -notlike "*\bin\*" -and
            $_.Name -notlike "package-lock.json"
        }

    foreach ($sourceFile in $sourceFiles) {
        $relativeFilePath = $sourceFile.FullName.Substring($projDir.Length + 1)
        
        $report.AppendLine("[FILE: $projName/$relativeFilePath]")
        $report.AppendLine("```")
        
        try {
            content = Get-Content -Path sourceFile.FullName -Raw -ErrorAction Stop
            report.AppendLine(content)
        } catch {
            \$report.AppendLine(" // Error reading file: \$_")
        }
        
        \$report.AppendLine("```")
        $report.AppendLine()
    }
    $report.AppendLine()
}

# 5. Write the entire structured dump to disk
Set-Content -Path $outputFile -Value $report.ToString() -Encoding utf8
Write-Host "Successfully generated structured solution dump at: $outputFile" -ForegroundColor Green
