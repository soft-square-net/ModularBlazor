var builder = DistributedApplication.CreateBuilder(args);

// ---------------------------------------------------------------- data services (containers)

// PostgreSQL: one standalone server. Published on the host's 5432 so tools (and the API when run
// outside Docker) can reach it at localhost:5432. Data survives restarts in a named volume.
var postgresPassword = builder.AddParameter("postgres-password", secret: true);

var postgres = builder
    .AddPostgres("postgres", password: postgresPassword, port: 5432)
    .WithDataVolume("modularblazor-postgres-data");

// Created on the server at startup; the resource name becomes ConnectionStrings:TenantStore in the API.
var tenantStore = postgres.AddDatabase("TenantStore", databaseName: "ModularBlazorTenants");

// Redis: standalone cache server, published on 6379. Becomes ConnectionStrings:redis in the API.
var redis = builder
    .AddRedis("redis", port: 6379)
    .WithDataVolume("modularblazor-redis-data");

// ---------------------------------------------------------------- applications (built from Dockerfiles)

// soft.square.net.ModularBlazor.Host (the API). The Docker build context is the repository root.
var api = builder
    .AddDockerfile("host-api", "../../..", "src/api/ModularBlazor.Host/Dockerfile")
    .WithHttpEndpoint(port: 5100, targetPort: 8080, name: "http")
    .WithExternalHttpEndpoints()
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
    .WithEnvironment("Documentation__Enabled", "true")
    .WithEnvironment("TenantStore__Provider", "PostgreSql")
    .WithEnvironment("Database__MigrateOnStartup", "true")
    .WithEnvironment("Cors__Origins__0", "http://localhost:5000")
    .WithReference(tenantStore)
    .WithReference(redis)
    .WaitFor(tenantStore)
    .WaitFor(redis);

// soft.square.net.ModularBlazor.Client (Blazor WebAssembly served by nginx).
builder
    .AddDockerfile("client", "../../..", "src/ModularBlazor.Client/Dockerfile")
    .WithHttpEndpoint(port: 5000, targetPort: 80, name: "http")
    .WithExternalHttpEndpoints()
    .WaitFor(api);

builder.Build().Run();
