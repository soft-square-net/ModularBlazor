using StackExchange.Redis;


// Force Docker Desktop to group all spun-up containers under this project name
Environment.SetEnvironmentVariable("COMPOSE_PROJECT_NAME", "Modular_Blazor_App");

bool loadPgreAdmin = true;
var builder = DistributedApplication.CreateBuilder(args);

// ---------------------------------------------------------------- data services (containers)

// PostgreSQL: one standalone server. Published on the host's 5432 so tools (and the API when run
// outside Docker) can reach it at localhost:5432. Data survives restarts in a named volume.
var postgresPassword = builder.AddParameter("postgres-password", secret: true);

var postgres = builder
    .AddPostgres("postgres", password: postgresPassword, port: 5432);
if (loadPgreAdmin) postgres.WithPgAdmin();
postgres.WithDataVolume("modularblazor-postgres-data");

// Created on the server at startup; the resource name becomes ConnectionStrings:TenantStore in the API.
var tenantStore = postgres.AddDatabase("TenantStore", databaseName: "ModularBlazorTenants");

// Redis: standalone cache server, published on 6379. Becomes ConnectionStrings:redis in the API.
var redis = builder
    .AddRedis("redis", port: 6379)
    .WithDataVolume("modularblazor-redis-data");

// ---------------------------------------------------------------- applications (built from Dockerfiles)

// HTTPS: both containers serve https with the development certificate in a password-protected .pfx that is
// bind-mounted at /https/aspnetapp.pfx. Create it once (use the same password for the "cert-password" parameter):
//   dotnet dev-certs https -ep src/api/ModularBlazor.Host/aspnetapp.pfx -p <password>
//   (copy it to src/apps/blazor/ModularBlazor.Client/aspnetapp.pfx) and: dotnet dev-certs https --trust
// In PowerShell put the password in single quotes: '123Pa$$word!' (double quotes expand "$$").
var certPassword = builder.AddParameter("my-cert-password", secret: true);

string Existing(params string[] parts)
{
    var path = Path.GetFullPath(Path.Combine([builder.AppHostDirectory, .. parts]));
    return File.Exists(path) || Directory.Exists(path)
        ? path
        : throw new FileNotFoundException($"Not found: {path}");
}

var apiCert = Existing("..", "..", "api", "ModularBlazor.Host", "aspnetapp.pfx");
var clientCert = Existing("..", "..", "apps", "blazor", "ModularBlazor.Client", "aspnetapp.pfx");

// soft.square.net.ModularBlazor.Host (the API). The Docker build context is the repository root. The ports are the
// ones the Dockerfile sets (ASPNETCORE_HTTP_PORTS / ASPNETCORE_HTTPS_PORTS).
var api = builder
    .AddDockerfile("host-api", "../../..", "src/api/ModularBlazor.Host/Dockerfile")
    .WithImage("host-api")
    .WithImageTag("latest")
    .WithHttpEndpoint(port: 5100, targetPort: 5100, name: "http")
    .WithHttpsEndpoint(port: 5101, targetPort: 5101, name: "https")
    .WithExternalHttpEndpoints()
    .WithBindMount(apiCert, "/https/aspnetapp.pfx", isReadOnly: true)
    .WithEnvironment("Kestrel__Certificates__Default__Path", "/https/aspnetapp.pfx")
    .WithEnvironment("Kestrel__Certificates__Default__Password", certPassword)
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
    .WithEnvironment("Documentation__Enabled", "true")
    .WithEnvironment("TenantStore__Provider", "PostgreSql")
    .WithEnvironment("Database__MigrateOnStartup", "true")
    // Cors:Origins is what the API reads; browsers send the exact origin of the page (no wildcards).
    .WithEnvironment("Cors__Origins__0", "http://localhost:5000")
    .WithEnvironment("Cors__Origins__1", "https://localhost:5001")
    .WithReference(tenantStore)
    .WithReference(redis)
    .WaitFor(tenantStore)
    .WaitFor(redis);

// soft.square.net.ModularBlazor.Client (Blazor WebAssembly served by nginx on 5000 http / 5001 https).
// The modules folder is bind-mounted over the image's copy, so modules rebuilt locally (build-modules.*) show up
// without rebuilding the image.
var clientModules = Existing("..", "..", "apps", "blazor", "ModularBlazor.Client", "wwwroot", "modules");

builder
    .AddDockerfile("client", "../../..", "src/apps/blazor/ModularBlazor.Client/Dockerfile")
    .WithImage("client")
    .WithImageTag("latest")
    .WithHttpEndpoint(port: 5000, targetPort: 5000, name: "http")
    .WithHttpsEndpoint(port: 5001, targetPort: 5001, name: "https")
    .WithExternalHttpEndpoints()
    .WithBuildArg("BUILD_MODULES", "false")
    .WithBindMount(clientModules, "/usr/share/nginx/html/modules", isReadOnly: true)
    .WithBindMount(clientCert, "/https/aspnetapp.pfx", isReadOnly: true)
    .WithEnvironment("CERT_PASSWORD", certPassword)
    .WaitFor(api);

builder.Build().Run();
