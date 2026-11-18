<#
.SYNOPSIS
  Saves a runtime module's OpenAPI document to a file, without the Aspire lab.

.DESCRIPTION
  A module's document (/openapi/modules/{id}.json) only exists while the module is routed, so this script:
    1. builds the WebApi host and the module (Debug);
    2. zips the module's build output into a temporary catalog folder;
    3. starts a throwaway host on that catalog (Development, no tenants, no broker, no identity service), signed in
       with a `dotnet user-jwts` token that has the platform-admin role;
    4. installs and activates the module, downloads its document, and stops the host.
  Nothing touches the host's own App_Data catalog or any database: with no tenants, activation migrates nothing.

  The saved file is the module's API contract. Commit it; clients (NSwag, openapi-typescript) are generated from it.

.EXAMPLE
  ./src/WebApi/scripts/Export-ModuleOpenApi.ps1 -Project src/WebApi/Modules/Custom/Content/WebApi.Modules.Content.Infrastructure -ModuleId content

.EXAMPLE
  # CI: fail when the endpoints changed but the committed document was not re-exported.
  ./src/WebApi/scripts/Export-ModuleOpenApi.ps1 -Project src/WebApi/Modules/Custom/Content/WebApi.Modules.Content.Infrastructure -ModuleId content -Check

.EXAMPLE
  # The host's own document (module admin, /api/pool) instead of a module's: src/WebApi/openapi/webapi.json.
  ./src/WebApi/scripts/Export-ModuleOpenApi.ps1 -HostDocument

.EXAMPLE
  # A core module (shipped with the host, active on startup, so nothing is installed):
  # src/WebApi/Modules/Core/WebApi.Modules.Core.Tenancy/openapi/tenancy.json.
  ./src/WebApi/scripts/Export-ModuleOpenApi.ps1 -CoreModuleId tenancy
#>
[CmdletBinding(DefaultParameterSetName = 'Module')]
param(
    # The module's entry project folder (the *.Infrastructure project of a layered module).
    [Parameter(Mandatory, ParameterSetName = 'Module')] [string] $Project,
    # The module id from its manifest.
    [Parameter(Mandatory, ParameterSetName = 'Module')] [string] $ModuleId,
    # Export the host's document (/openapi/webapi.json) instead of a module's; no module is installed.
    [Parameter(Mandatory, ParameterSetName = 'Host')] [switch] $HostDocument,
    # Export a core module's document: the host seeds core modules as Active on startup, so nothing is installed.
    [Parameter(Mandatory, ParameterSetName = 'Core')] [string] $CoreModuleId,
    # Where to write the document. Default: <module folder>/openapi/<id>.json next to the module's projects, or
    # src/WebApi/openapi/webapi.json for the host.
    [string] $Output,
    [int] $Port = 5399,
    # CI: export to a temporary file and fail (exit 1) when it differs from the committed document, instead of writing.
    [switch] $Check
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$hostProject = Join-Path $repo 'src/WebApi/WebApi'
$installModule = $PSCmdlet.ParameterSetName -eq 'Module'
if ($HostDocument) {
    $ModuleId = 'webapi'
    if (-not $Output) { $Output = Join-Path $repo 'src/WebApi/openapi/webapi.json' }
}
elseif ($CoreModuleId) {
    $ModuleId = $CoreModuleId
    if (-not $Output) {
        $coreProject = Get-ChildItem (Join-Path $repo 'src/WebApi/Modules/Core') -Directory |
            Where-Object { $_.Name -like "*.$CoreModuleId" } | Select-Object -First 1
        if (-not $coreProject) { throw "No core module project ends with '.$CoreModuleId'; pass -Output." }
        $Output = Join-Path $coreProject.FullName "openapi/$CoreModuleId.json"
    }
}
else {
    $projectDir = (Resolve-Path $Project).Path
    if (-not $Output) { $Output = Join-Path (Split-Path $projectDir -Parent) "openapi/$ModuleId.json" }
}
$committed = $Output
if ($Check) { $Output = Join-Path ([IO.Path]::GetTempPath()) "module-openapi-$ModuleId-check.json" }

Write-Host "Building the host$(if ($installModule) { ' and the module' })..."
dotnet build $hostProject -v q --nologo | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Host build failed." }
if ($installModule) {
    dotnet build $projectDir -v q --nologo | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Module build failed." }
}

$work = Join-Path ([IO.Path]::GetTempPath()) "module-openapi-$ModuleId-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$catalog = Join-Path $work 'catalog'
New-Item -ItemType Directory -Force $catalog | Out-Null
$package = Join-Path $work "$ModuleId.zip"
if ($installModule) { Compress-Archive -Path (Join-Path $projectDir 'bin/Debug/net10.0/*') -DestinationPath $package }

# A development token with the platform-admin role (permission platform.modules.manage), signed with the host's
# user-secrets key. Only valid for this machine's Development host.
$token = (dotnet user-jwts create --project $hostProject --role platform-admin --output token).Trim()
if ($LASTEXITCODE -ne 0 -or -not $token) { throw "dotnet user-jwts failed." }

$hostDll = Get-ChildItem (Join-Path $hostProject 'bin/Debug/net10.0') -Filter '*.WebApi.dll' | Select-Object -First 1
$baseUrl = "http://127.0.0.1:$Port"
$environment = @{
    ASPNETCORE_ENVIRONMENT = 'Development'
    ASPNETCORE_URLS        = $baseUrl
    Modules__Path          = $catalog
    OTEL_EXPORTER_OTLP_ENDPOINT = ''
}
$saved = @{}
foreach ($name in $environment.Keys) { $saved[$name] = [Environment]::GetEnvironmentVariable($name); [Environment]::SetEnvironmentVariable($name, $environment[$name]) }

$hostProcess = $null
try {
    Write-Host "Starting a throwaway host on $baseUrl..."
    $hostProcess = Start-Process dotnet -ArgumentList "`"$($hostDll.FullName)`"" -WorkingDirectory $hostProject -PassThru -NoNewWindow `
        -RedirectStandardOutput (Join-Path $work 'host.out.log') -RedirectStandardError (Join-Path $work 'host.err.log')

    $ready = $false
    for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
        Start-Sleep -Milliseconds 500
        if ($hostProcess.HasExited) { throw "The host stopped while starting; see $work/host.*.log" }
        try { $ready = (Invoke-WebRequest "$baseUrl/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { }
    }
    if (-not $ready) { throw "The host did not become healthy in 30 s; see $work/host.*.log" }

    $documentUrl = if ($HostDocument) { "$baseUrl/openapi/webapi.json" } else { "$baseUrl/openapi/modules/$ModuleId.json" }
    if ($installModule) {
        $auth = "Authorization: Bearer $token"
        Write-Host "Installing and activating '$ModuleId'..."
        $install = curl.exe -s -o (Join-Path $work 'install.json') -w '%{http_code}' -H $auth -F "package=@$package" "$baseUrl/api/admin/modules"
        if ($install -notmatch '^2') { throw "Install failed ($install): $(Get-Content (Join-Path $work 'install.json') -Raw)" }
        $activate = curl.exe -s -o (Join-Path $work 'activate.json') -w '%{http_code}' -X POST -H $auth "$baseUrl/api/admin/modules/$ModuleId/activate"
        if ($activate -notmatch '^2') { throw "Activate failed ($activate): $(Get-Content (Join-Path $work 'activate.json') -Raw)" }
    }

    New-Item -ItemType Directory -Force (Split-Path $Output -Parent) | Out-Null
    $download = curl.exe -s -o $Output -w '%{http_code}' $documentUrl
    if ($download -ne '200') { throw "Downloading the document failed ($download)." }
    # Saved byte for byte as the host wrote it (its server URL is relative, "/"), so diffs show only API changes.
    if ($Check) {
        $same = (Test-Path $committed) -and ((Get-FileHash $committed).Hash -eq (Get-FileHash $Output).Hash)
        Remove-Item $Output -Force
        if (-not $same) {
            Write-Host "The API of '$ModuleId' changed but $committed was not re-exported. Run this script without -Check and commit the result."
            $script:checkFailed = $true
        }
        else { Write-Host "$committed is up to date." }
    }
    else { Write-Host "Saved $Output" }
}
finally {
    if ($hostProcess -and -not $hostProcess.HasExited) { Stop-Process -Id $hostProcess.Id -Force }
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
if ($script:checkFailed) { exit 1 }
