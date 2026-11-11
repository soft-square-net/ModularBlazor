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
var tenantData = builder.AddPostgres("tenant-data")
    .WithDataVolume("hybird-tenant-data")
    .WithPgAdmin();
var tenantStore = tenantData.AddDatabase("TenantStore", databaseName: "HybirdTenants");
tenantData.AddDatabase("tenant-acme");
tenantData.AddDatabase("tenant-globex");

// ---------------------------------------------------------------- module pools (same image, different config)

// Core pool: every module except the extracted ones.
var core = AddPool("core", role: "Api", replicas: 2, "identity", "workflow", "inventory");

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

        // Lab only: reach one pool directly (its admin API, /api/pool, /openapi) through the gateway.
        yarp.AddRoute("/pools/core/{**catch-all}", coreCluster).WithTransformPathRemovePrefix("/pools/core");
        yarp.AddRoute("/pools/sales/{**catch-all}", salesCluster).WithTransformPathRemovePrefix("/pools/sales");
        yarp.AddRoute("/pools/worker/{**catch-all}", workerCluster).WithTransformPathRemovePrefix("/pools/worker");
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
            .WithHttpHealthCheck("/health");

        for (var i = 0; i < modules.Length; i++)
            replica.WithEnvironment($"Modules__Enabled__{i}", modules[i]);
        return replica;
    }).ToArray();

static YarpCluster Cluster(IYarpConfigurationBuilder yarp, string name, IResourceBuilder<ProjectResource>[] replicas) =>
    yarp.AddCluster(name, replicas.Select(r => (object)r.GetEndpoint("http")).ToArray())
        .WithLoadBalancingPolicy("RoundRobin");
