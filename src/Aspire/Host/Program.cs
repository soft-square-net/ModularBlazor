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
// var hostCertFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".aspnet", "https");
var certPassword = builder.AddParameter("cert-password", secret: true);

    // Mount the host certificate folder into the container's expected path
    // .WithBindMount(hostCertFolder, "/root/.aspnet/https")




var api = builder
    .AddDockerfile("host-api", "../../..", "src/api/ModularBlazor.Host/Dockerfile")
    .WithImage("host-api") // Sets a fixed repository name
    .WithImageTag("latest") // Fixes the tag so it reuses the image instead of generating a new hash
    .WithHttpEndpoint(port: 5100, targetPort: 5100, name: "http")
    .WithHttpsEndpoint(port: 5101, targetPort: 5101, name: "https")
    //  .WithEnvironment("ASPNETCORE_URLS", "http://+:5100;https://+:5101")
    .WithDeveloperCertificateTrust(trust:true)
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
    .WithEnvironment("Documentation__Enabled", "true")
    .WithEnvironment("TenantStore__Provider", "PostgreSql")
    .WithEnvironment("Database__MigrateOnStartup", "true")
    .WithEnvironment("Cors__AllowedOrigins__0", "http://*:5000")
    .WithEnvironment("Cors__AllowedOrigins__1", "https://*:5001")
    .WithReference(tenantStore)
    .WithReference(redis)
    .WaitFor(tenantStore)
    .WaitFor(redis);

// soft.square.net.ModularBlazor.Client (Blazor WebAssembly served by nginx). The project lives in src/apps/blazor.
// The modules folder is bind-mounted over the image's copy, so modules rebuilt locally (build-modules.*) show up
// without rebuilding the image. The path is resolved from the AppHost's own folder and checked: a wrong path would
// otherwise make Docker create an empty folder and the client would start without its modules.
var clientModules = Path.GetFullPath(Path.Combine(builder.AppHostDirectory, "..", "..", "apps", "blazor", "ModularBlazor.Client", "wwwroot", "modules"));
if (!Directory.Exists(clientModules))
  throw new DirectoryNotFoundException($"Client modules folder not found: {clientModules}");

builder
    .AddDockerfile("client", "../../..", "src/apps/blazor/ModularBlazor.Client/Dockerfile")
    .WithImage("client") // Sets a fixed repository name
    .WithImageTag("latest") // Fixes the tag
    .WithHttpEndpoint(port: 5000, targetPort: 5000, name: "http")
    .WithHttpsEndpoint(port: 5001, targetPort: 5001, name: "https")
   //  .WithEnvironment("ASPNETCORE_URLS", "http://+:5000;https://+:5001")
    .WithEnvironment("BUILD_MODULES", "false")
    .WithDeveloperCertificateTrust(trust: true)
    .WithExternalHttpEndpoints()
    .WithBindMount(clientModules, "/usr/share/nginx/html/modules", isReadOnly: true)
    .WaitFor(api);

builder.Build().Run();

// dotnet dev-certs https -ep %USERPROFILE%\.aspnet\https\aspnetapp.pfx -p 123Pa$$word!

