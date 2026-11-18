$ErrorActionPreference = 'Stop'
$repo = 'D:\ASP\Claude\Blazor WASM Modular Project\_repo'
$hostProject = Join-Path $repo 'src/WebApi/WebApi'
$module = Join-Path $repo 'src/WebApi/Modules/Custom/WebApi.Modules.Greeting'
dotnet build $PSScriptRoot -v q --nologo | Select-String ' error ' ; if ($LASTEXITCODE -ne 0) { throw 'test build failed' }
dotnet build $module -v q --nologo | Out-Null
$work = Join-Path $PSScriptRoot 'work'; Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $work 'catalog') | Out-Null
$zip = Join-Path $work 'greeting.zip'
Compress-Archive -Path (Join-Path $module 'bin/Debug/net10.0/*') -DestinationPath $zip
$token = (dotnet user-jwts create --project $hostProject --role platform-admin --output token).Trim()
$env:ASPNETCORE_ENVIRONMENT = 'Development'; $env:ASPNETCORE_URLS = 'http://127.0.0.1:5398'
$env:Modules__Path = Join-Path $work 'catalog'; $env:OTEL_EXPORTER_OTLP_ENDPOINT = ''
$hostDll = Get-ChildItem (Join-Path $hostProject 'bin/Debug/net10.0') -Filter '*.WebApi.dll' | Select-Object -First 1
$p = Start-Process dotnet -ArgumentList "`"$($hostDll.FullName)`"" -WorkingDirectory $hostProject -PassThru -NoNewWindow `
    -RedirectStandardOutput (Join-Path $work 'out.log') -RedirectStandardError (Join-Path $work 'err.log')
try {
    for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; try { if ((Invoke-WebRequest 'http://127.0.0.1:5398/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { break } } catch { } }
    dotnet run --project $PSScriptRoot --no-build -- 'http://127.0.0.1:5398/' $token $zip
    "exit=$LASTEXITCODE"
}
finally { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
