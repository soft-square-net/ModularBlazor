$ErrorActionPreference = 'Stop'
$repo = 'D:\ASP\Claude\Blazor WASM Modular Project\_repo'
$hostProject = Join-Path $repo 'src/WebApi/WebApi'
$server = '(localdb)\MSSQLLocalDB'
$databases = @('claude-test-tenantstore', 'tenant-acme', 'tenant-globex', 'tenant-subtest')
dotnet build $PSScriptRoot -v q --nologo | Select-String ' error '; if ($LASTEXITCODE -ne 0) { throw 'test build failed' }
$work = Join-Path $PSScriptRoot 'work'; Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $work 'catalog') | Out-Null
$token = (dotnet user-jwts create --project $hostProject --role platform-admin --output token).Trim()

$env:ASPNETCORE_ENVIRONMENT = 'Development'; $env:ASPNETCORE_URLS = 'http://127.0.0.1:5397'
$env:Modules__Path = Join-Path $work 'catalog'; $env:OTEL_EXPORTER_OTLP_ENDPOINT = ''
$env:ConnectionStrings__TenantStore = "Server=$server;Database=claude-test-tenantstore;Integrated Security=true;TrustServerCertificate=true"
$env:DatabaseServers__TenantStore__Provider = 'SqlServer'
$env:ConnectionStrings__tenant_data = $null
${env:ConnectionStrings__tenant-data} = "Server=$server;Integrated Security=true;TrustServerCertificate=true"
${env:DatabaseServers__tenant-data__Provider} = 'SqlServer'

sqlcmd -S $server -E -b -Q "IF DB_ID('claude-test-tenantstore') IS NULL CREATE DATABASE [claude-test-tenantstore]" | Out-Null
$hostDll = Get-ChildItem (Join-Path $hostProject 'bin/Debug/net10.0') -Filter '*.WebApi.dll' | Select-Object -First 1
$p = Start-Process dotnet -ArgumentList "`"$($hostDll.FullName)`"" -WorkingDirectory $hostProject -PassThru -NoNewWindow `
    -RedirectStandardOutput (Join-Path $work 'out.log') -RedirectStandardError (Join-Path $work 'err.log')
try {
    $ready = $false
    for ($i = 0; $i -lt 120 -and -not $ready; $i++) { Start-Sleep -Milliseconds 500; try { $ready = (Invoke-WebRequest 'http://127.0.0.1:5397/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { } }
    if (-not $ready) { Get-Content (Join-Path $work 'out.log') -Tail 30; throw 'host not healthy' }
    Start-Sleep -Seconds 3 # tenant seeding runs on activation
    $ErrorActionPreference = 'Continue'
    cmd /c "dotnet run --project `"$PSScriptRoot`" --no-build -- http://127.0.0.1:5397/ $token 2>&1"
    "exit=$LASTEXITCODE"
    Select-String -Path (Join-Path $work 'out.log') -Pattern 'fail|error|exception' | Select-Object -First 8 | ForEach-Object { $_.Line }
}
finally {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    foreach ($db in $databases) {
        sqlcmd -S $server -E -b -Q "IF DB_ID('$db') IS NOT NULL BEGIN ALTER DATABASE [$db] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$db]; END" | Out-Null
    }
    "dropped test databases: $(($databases) -join ', ')"
}
