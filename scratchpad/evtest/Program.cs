using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.WebApi.Contracts.Tenancy;
using soft.square.net.WebApi.Data;
using soft.square.net.WebApi.SharedKernel;

var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
{
    // Nothing listens on port 1: the write fails, after the handlers ran.
    ["ConnectionStrings:tenant-data"] = "Host=127.0.0.1;Port=1;Database=x;Username=u;Password=p;Timeout=2",
}).Build();

int failures = 0;
void Check(bool ok, string what) { Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {what}"); if (!ok) failures++; }

ServiceProvider Build(Action<IServiceCollection> handlers)
{
    var s = new ServiceCollection();
    s.AddLogging();
    s.AddSingleton<IConfiguration>(config);
    s.AddSingleton(new TenantDatabases(config));
    s.AddScoped<ITenantContext, FixedTenant>();
    s.AddScoped<Log>();
    s.AddTenantDbContext<TestDb>();
    handlers(s);
    return s.BuildServiceProvider();
}

// 1. Handlers run (two per event, plus a second round), before the write.
using (var sp = Build(s =>
{
    s.AddScoped<IDomainEventHandler<Archived>, RecordArchived>();
    s.AddScoped<IDomainEventHandler<Archived>, SpawnFollowUp>();
    s.AddScoped<IDomainEventHandler<FollowUpCreated>, RecordFollowUp>();
}))
using (var scope = sp.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TestDb>();
    var note = new Note("a"); db.Add(note); note.Archive();
    Exception? error = null;
    try { await db.SaveChangesAsync(); } catch (Exception e) { error = e; }
    var log = scope.ServiceProvider.GetRequiredService<Log>().Entries;
    Console.WriteLine("  log: " + string.Join(", ", log));
    Check(log.SequenceEqual(["archived:a", "followup:a"]), "both handlers ran, second-round event handled");
    Check(db.ChangeTracker.Entries<Note>().Count() == 2, "handler's new entity is tracked for the same save");
    Console.WriteLine("  write error: " + error?.GetType().Name + ": " + error?.Message + " / inner: " + error?.InnerException?.GetType().Name); Check(error is not null && !error.Message.Contains("domain event", StringComparison.OrdinalIgnoreCase) && !error.Message.Contains("handler", StringComparison.OrdinalIgnoreCase), "then the write itself was attempted");
    Check(!((IHasDomainEvents)note).HasDomainEvents, "events were taken");
}

// 2. A handler that saves is refused.
using (var sp = Build(s => s.AddScoped<IDomainEventHandler<Archived>, SavingHandler>()))
using (var scope = sp.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TestDb>();
    var note = new Note("b"); db.Add(note); note.Archive();
    var e = await Record(() => db.SaveChangesAsync());
    Check(e is InvalidOperationException && e.Message.Contains("must not save"), "nested save from a handler throws");
}

// 3. Sync SaveChanges with pending events is refused.
using (var sp = Build(_ => { }))
using (var scope = sp.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TestDb>();
    var note = new Note("c"); db.Add(note); note.Archive();
    var e = await Record(() => Task.FromResult(db.SaveChanges()));
    Check(e is InvalidOperationException && e.Message.Contains("SaveChangesAsync"), "sync SaveChanges refuses pending events");
}

// 4. Handlers that keep raising events stop after the round limit.
using (var sp = Build(s => s.AddScoped<IDomainEventHandler<Archived>, Loop>()))
using (var scope = sp.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TestDb>();
    var note = new Note("d"); db.Add(note); note.Archive();
    var e = await Record(() => db.SaveChangesAsync());
    Check(e is InvalidOperationException && e.Message.Contains("rounds"), "endless event loop is cut off");
}

// 5. The model does not map the event list.
using (var sp = Build(_ => { }))
using (var scope = sp.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TestDb>();
    var props = db.Model.FindEntityType(typeof(Note))!.GetProperties().Select(p => p.Name).ToList();
    Console.WriteLine("  mapped: " + string.Join(", ", props));
    Check(!props.Any(p => p.Contains("Event", StringComparison.OrdinalIgnoreCase)), "domain events are not mapped");
}

Console.WriteLine(failures == 0 ? "ALL PASSED" : $"{failures} FAILED");
return failures;

static async Task<Exception?> Record(Func<Task> action) { try { await action(); return null; } catch (Exception e) { return e; } }

sealed class FixedTenant : ITenantContext
{
    public TenantInfo? Tenant { get; } = new("acme", "Acme", TenantStatus.Active, [], "tenant-data", "acme");
    public string? ResolvedBy => "test";
}

sealed class Log { public List<string> Entries { get; } = []; }

sealed record Archived(string Title) : IDomainEvent;
sealed record FollowUpCreated(string Title) : IDomainEvent;

sealed class Note : AggregateRoot<int>, ITenantOwned
{
    public Note(string title) { Title = title; }
    public string Title { get; private set; }
    public bool IsArchived { get; private set; }
    public string TenantId { get; set; } = "";
    public void Archive() { IsArchived = true; Raise(new Archived(Title)); }
    public static Note FollowUp(string title) { var n = new Note(title + "-followup"); n.Raise(new FollowUpCreated(title)); return n; }
}

sealed class TestDb(DbContextOptions<TestDb> options, ITenantContext tenant) : TenantDbContext(options, tenant)
{
    public DbSet<Note> Notes => Set<Note>();
    protected override string Schema => "evtest";
    protected override void ConfigureModel(ModelBuilder b) => b.Entity<Note>();
}

sealed class RecordArchived(Log log) : IDomainEventHandler<Archived>
{
    public Task HandleAsync(Archived e, CancellationToken ct) { log.Entries.Add("archived:" + e.Title); return Task.CompletedTask; }
}
sealed class SpawnFollowUp(TestDb db) : IDomainEventHandler<Archived>
{
    public Task HandleAsync(Archived e, CancellationToken ct) { db.Add(Note.FollowUp(e.Title)); return Task.CompletedTask; }
}
sealed class RecordFollowUp(Log log) : IDomainEventHandler<FollowUpCreated>
{
    public Task HandleAsync(FollowUpCreated e, CancellationToken ct) { log.Entries.Add("followup:" + e.Title); return Task.CompletedTask; }
}
sealed class SavingHandler(TestDb db) : IDomainEventHandler<Archived>
{
    public async Task HandleAsync(Archived e, CancellationToken ct) => await db.SaveChangesAsync(ct);
}
sealed class Loop(TestDb db) : IDomainEventHandler<Archived>
{
    public Task HandleAsync(Archived e, CancellationToken ct) { var n = new Note(e.Title + "+"); db.Add(n); n.Archive(); return Task.CompletedTask; }
}
