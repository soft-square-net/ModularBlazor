// Hybrid architecture lab: the research target architecture as a runnable Aspire model.
//
//   Client ─► YARP gateway ─► module pools (one WebApi image; EnabledModules + Role per pool; replicas)
//                                  │
//                                  ├─► broker (RabbitMQ)       integration events: outbox → topics → DLQ
//                                  ├─► Redis                   cache, locks, data-protection keys, rate-limit counters
//                                  └─► tenant data (Postgres)  tenant store + per-tenant databases
//
//   Observability: every replica exports OpenTelemetry (traces, metrics, logs) to the Aspire dashboard.
//   Not modelled locally: the CDN (static Blazor _framework files) and edge TLS; see README.md.

using Aspire.Hosting.Yarp;
using Aspire.Hosting.Yarp.Transforms;
using Yarp.ReverseProxy.Transforms;

var builder = DistributedApplication.CreateBuilder(args);

// ---------------------------------------------------------------- shared infrastructure

// Message broker. Replicas receive ConnectionStrings:broker; the management UI is linked from the dashboard.
var broker = builder.AddRabbitMQ("broker")
    .WithManagementPlugin()
    .WithDataVolume("hybird-broker-data");

// Redis: shared state every replica needs (HybridCache, distributed locks, Data Protection keys, rate limits).
var redis = builder.AddRedis("redis")
    .WithDataVolume("hybird-redis-data");

// Tenant data: one server holding the tenant store and a database per tenant (database-per-tenant model).
// Replicas get ConnectionStrings:TenantStore (the registry of tenants, schema "platform") and ConnectionStrings:tenant-data
// (the server: a tenant row names this server plus its database, and new tenants' databases are created on it).
var tenantData = builder.AddPostgres("tenant-data")
    .WithDataVolume("hybird-tenant-data")
    .WithPgAdmin();
var tenantStore = tenantData.AddDatabase("TenantStore", databaseName: "HybirdTenants");
tenantData.AddDatabase("tenant-acme");
tenantData.AddDatabase("tenant-globex");

// Optional tenant database servers on the other engines, switched on by Lab:Engines (comma-separated: sqlserver,
// mysql, oracle; e.g. dotnet run --project src/Aspire/Hybird --launch-profile http -- --Lab:Engines=sqlserver,mysql,oracle).
// Each is one more server a tenant can be created on, e.g. POST /api/tenancy/tenants {"id":"contoso","databaseServer":"tenant-sql"}.
// Replicas get ConnectionStrings:<server> and DatabaseServers:<server>:Provider; modules migrate their schema there
// from the engine's migration set in their own assembly.
var engines = (builder.Configuration["Lab:Engines"] ?? "")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Select(e => e.ToLowerInvariant()).ToHashSet();
var databaseServers = new List<Action<IResourceBuilder<ProjectResource>>>
{
    replica => replica.WithReference(tenantData).WithEnvironment("DatabaseServers__tenant-data__Provider", "PostgreSql")
};
if (engines.Contains("sqlserver"))
{
    var sql = builder.AddSqlServer("tenant-sql").WithDataVolume("hybird-tenant-sql");
    databaseServers.Add(replica => replica.WithReference(sql).WaitFor(sql).WithEnvironment("DatabaseServers__tenant-sql__Provider", "SqlServer"));
}
if (engines.Contains("mysql"))
{
    var mysql = builder.AddMySql("tenant-mysql").WithDataVolume("hybird-tenant-mysql");
    databaseServers.Add(replica => replica.WithReference(mysql).WaitFor(mysql).WithEnvironment("DatabaseServers__tenant-mysql__Provider", "MySql"));
}
if (engines.Contains("oracle"))
{
    // Oracle Database Free: tenants are schemas in the FREEPDB1 pluggable database, created by SYSTEM.
    var oracle = builder.AddOracle("oracle").WithDataVolume("hybird-tenant-oracle").AddDatabase("tenant-oracle", "FREEPDB1");
    databaseServers.Add(replica => replica.WithReference(oracle).WaitFor(oracle).WithEnvironment("DatabaseServers__tenant-oracle__Provider", "Oracle"));
}

// ---------------------------------------------------------------- identity service (OpenIddict, its own database)

// Issues tenant-bound JWT access tokens (audience "modular-webapi") for every pool. A fixed port keeps the issuer
// stable: resource servers validate tokens with Authority = IdentityIssuer and read the keys from its JWKS.
// Not routed through the gateway: the issuer is one URL, and in production it gets its own host name.
const int IdentityPort = 5090;
const string IdentityIssuer = "http://localhost:5090/";
// Resource "identity-db" (names are unique across resources), database "identity", passed as ConnectionStrings:identity.
var identityDb = tenantData.AddDatabase("identity-db", databaseName: "identity");
var identity = builder.AddProject<Projects.WebApi_Identity_Server>("identity", launchProfileName: null)
    .WithHttpEndpoint(port: IdentityPort)
    .WithExternalHttpEndpoints()
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
    .WithEnvironment("Identity__Issuer", IdentityIssuer)
    .WithReference(identityDb, connectionName: "identity").WaitFor(identityDb)
    .WithHttpHealthCheck("/health");

// ---------------------------------------------------------------- module pools (same image, different config)

// Core pool: every module except the extracted ones. "identity" and "tenancy" are core modules: they ship with every
// WebApi release (CoreModules folder) and are seeded into the catalog as Active on first start.
var core = AddPool("core", role: "Api", replicas: 2, "identity", "tenancy", "workflow", "inventory");

// Sales pool: the module that needed independent scaling. The sample "greeting" module stands in for Sales here.
var sales = AddPool("sales", role: "Api", replicas: 4, "sales", "greeting");

// Worker pool: loads modules for their consumers and jobs, gets no public HTTP routes. In production it scales on
// queue lag (e.g. KEDA on the RabbitMQ queue length); locally it is a fixed count.
var worker = AddPool("worker", role: "Worker", replicas: 2, "sales", "greeting", "workflow");

// ---------------------------------------------------------------- edge: YARP gateway

var gateway = builder.AddYarp("gateway")
    .WithHostPort(5080)
    .WithConfiguration(yarp =>
    {
        // One cluster per pool with every replica as a destination: YARP balances per request (L7).
        // Pointing YARP at a single load-balanced address instead (Aspire's replica proxy, a Kubernetes ClusterIP
        // service) balances per TCP connection, and YARP's pooled keep-alive connection pins all traffic to one replica.
        var coreCluster = Cluster(yarp, "core", core);
        var salesCluster = Cluster(yarp, "sales", sales);
        var workerCluster = Cluster(yarp, "worker", worker);

        // Extracted modules go to their own pool; everything else to the core pool.
        yarp.AddRoute("/api/sales/{**catch-all}", salesCluster);
        yarp.AddRoute("/api/greeting/{**catch-all}", salesCluster);
        yarp.AddRoute("/{**catch-all}", coreCluster);

        // Lab only: reach one pool directly (its admin API, /api/pool, /openapi, /scalar) through the gateway.
        // X-Forwarded-Prefix tells the pool which path it was reached through, so its Scalar and OpenAPI URLs keep it.
        PoolRoute("core", coreCluster);
        PoolRoute("sales", salesCluster);
        PoolRoute("worker", workerCluster);

        void PoolRoute(string pool, YarpCluster cluster) =>
            yarp.AddRoute($"/pools/{pool}/{{**catch-all}}", cluster)
                .WithTransformPathRemovePrefix($"/pools/{pool}")
                // The default X-Forwarded transforms would overwrite the prefix with the (empty) PathBase.
                .WithTransformXForwarded(xPrefix: ForwardedTransformActions.Off)
                .WithTransformRequestHeader("X-Forwarded-Prefix", $"/pools/{pool}", append: false);
    });
// The clusters name each replica by service-discovery name (http://core-1, ...); referencing the replicas gives
// the gateway the matching discovery entries.
foreach (var replica in core.Concat(sales).Concat(worker))
    gateway.WithReference(replica).WaitFor(replica);

builder.Build().Run();

// A pool is N replicas of the same WebApi project; the pool, its role and the modules it may activate are
// configuration only. Each replica is its own resource so the gateway can address it directly (Aspire's
// WithReplicas only offers a shared proxied address).
IResourceBuilder<ProjectResource>[] AddPool(string name, string role, int replicas, params string[] modules) =>
    Enumerable.Range(1, replicas).Select(n =>
    {
        var replica = builder.AddProject<Projects.WebApi>($"{name}-{n}", launchProfileName: null)
            .WithHttpEndpoint()
            .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
            .WithEnvironment("Modules__Pool", name)
            .WithEnvironment("Modules__Role", role)
            // One module catalog for every pool (stand-in for the modules table): each pool applies the modules it
            // enables. Lifecycle changes are broadcast over the broker ("modules.state") so every replica converges.
            .WithEnvironment("Modules__Path", "App_Data/modules-catalog")
            .WithReference(broker).WaitFor(broker)
            .WithReference(redis).WaitFor(redis)
            .WithReference(tenantStore).WaitFor(tenantStore)
            .WithEnvironment("DatabaseServers__TenantStore__Provider", "PostgreSql")
            .WithHttpHealthCheck("/health");

        foreach (var server in databaseServers) server(replica); // tenant-data plus the Lab:Engines servers
        for (var i = 0; i < modules.Length; i++)
            replica.WithEnvironment($"Modules__Enabled__{i}", modules[i]);
        return replica;
    }).ToArray();

static YarpCluster Cluster(IYarpConfigurationBuilder yarp, string name, IResourceBuilder<ProjectResource>[] replicas) =>
    yarp.AddCluster(name, replicas.Select(r => (object)r.GetEndpoint("http")).ToArray())
        .WithLoadBalancingPolicy("RoundRobin");
