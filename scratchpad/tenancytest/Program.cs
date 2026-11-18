using System.Net.Http.Headers;
using soft.square.net.WebApi.Modules.Core.Tenancy.Client;

// args: baseUrl token
var http = new HttpClient { BaseAddress = new Uri(args[0]) };
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", args[1]);
var api = new TenancyClient(http);
var failures = 0;
void Check(bool ok, string what) { Console.WriteLine($"{(ok ? "PASS" : "FAIL")} {what}"); if (!ok) failures++; }
async Task Expect(int status, Func<Task> call, string what)
{
    try { await call(); Check(false, $"{what}: no error"); }
    catch (TenancyApiException e) { Check(e.StatusCode == status, $"{what} -> {e.StatusCode}"); }
}
var now = DateTimeOffset.UtcNow;
const string T = "subtest";

var tenants = await api.ListTenantsAsync();
Check(tenants.Any(t => t.Id == "acme") && tenants.Any(t => t.Id == "globex"), $"ListTenants (seeded): {string.Join(", ", tenants.Select(t => t.Id))}");

var created = await api.CreateTenantAsync(new CreateTenantRequest { Id = T, Name = "Subscription test" });
Check(created.Id == T && created.Status == TenantStatus.Active, $"CreateTenant {created.Id} db={created.DatabaseName}");
await Expect(409, () => api.CreateTenantAsync(new CreateTenantRequest { Id = T }), "CreateTenant duplicate");
await Expect(400, () => api.CreateTenantAsync(new CreateTenantRequest { Id = "Bad Id!" }), "CreateTenant invalid id");

var row = (await api.SubscriptionReportAsync()).Single(r => r.TenantId == T);
Check(row.Current is null && row.NeedsAttention && row.EndsAt is null, "Report: no subscription -> NeedsAttention");

var first = await api.AddSubscriptionAsync(T, new NewSubscription { StartsAt = now.AddDays(-10), EndsAt = now.AddDays(20), Plan = "Pro" });
Check(first.State == SubscriptionState.Current && first.Plan == "Pro" && first.CreatedBy is not null, $"AddSubscription current (by {first.CreatedBy})");
await Expect(409, () => api.AddSubscriptionAsync(T, new NewSubscription { StartsAt = now.AddDays(5), EndsAt = now.AddDays(30) }), "AddSubscription overlapping");
await Expect(400, () => api.AddSubscriptionAsync(T, new NewSubscription { StartsAt = now.AddDays(90), EndsAt = now.AddDays(80) }), "AddSubscription end before start");
await Expect(404, () => api.AddSubscriptionAsync("nobody", new NewSubscription { StartsAt = now, EndsAt = now.AddDays(1) }), "AddSubscription unknown tenant");

var second = await api.AddSubscriptionAsync(T, new NewSubscription { StartsAt = first.EndsAt, EndsAt = now.AddDays(50) });
Check(second.State == SubscriptionState.Upcoming, "AddSubscription contiguous -> Upcoming");

row = (await api.SubscriptionReportAsync()).Single(r => r.TenantId == T);
Check(row.Current?.Id == first.Id && row.Next?.Id == second.Id, "Report: current and next");
Check(row.EndsAt is { } e1 && Math.Abs((e1 - now.AddDays(50)).TotalSeconds) < 5 && row.DaysLeft == 49 && !row.NeedsAttention,
    $"Report: covered until the chained end, daysLeft={row.DaysLeft}, needsAttention={row.NeedsAttention}");
Check((await api.SubscriptionReportAsync(60)).Single(r => r.TenantId == T).NeedsAttention, "Report endingWithinDays=60 -> NeedsAttention");

await Expect(409, () => api.ExtendSubscriptionAsync(T, first.Id, new ExtendSubscription { EndsAt = now.AddDays(25) }), "Extend into the next subscription");
await Expect(400, () => api.ExtendSubscriptionAsync(T, second.Id, new ExtendSubscription { EndsAt = now.AddDays(40) }), "Extend to an earlier end");
var extended = await api.ExtendSubscriptionAsync(T, second.Id, new ExtendSubscription { EndsAt = now.AddDays(80) });
Check(Math.Abs((extended.EndsAt - now.AddDays(80)).TotalSeconds) < 5, "Extend later");

var cancelled = await api.CancelSubscriptionAsync(T, second.Id, new CancelSubscription { Reason = "Customer left" });
Check(cancelled.State == SubscriptionState.Cancelled && cancelled.CancelReason == "Customer left", "Cancel");
await Expect(409, () => api.CancelSubscriptionAsync(T, second.Id, new CancelSubscription()), "Cancel twice");
await Expect(409, () => api.ExtendSubscriptionAsync(T, second.Id, new ExtendSubscription { EndsAt = now.AddDays(99) }), "Extend cancelled");
await Expect(404, () => api.CancelSubscriptionAsync(T, Guid.NewGuid(), new CancelSubscription()), "Cancel unknown subscription");

row = (await api.SubscriptionReportAsync()).Single(r => r.TenantId == T);
Check(row.Next is null && row.EndsAt is { } e2 && Math.Abs((e2 - first.EndsAt).TotalSeconds) < 1, "Report after cancel: covered until the first end");

var list = await api.ListSubscriptionsAsync(T);
Check(list.Count == 2 && list[0].Id == first.Id && list[1].State == SubscriptionState.Cancelled, "ListSubscriptions: history kept, oldest first");
await Expect(404, () => api.ListSubscriptionsAsync("nobody"), "ListSubscriptions unknown tenant");

var suspended = await api.SuspendTenantAsync(T);
Check(suspended.Status == TenantStatus.Suspended, "SuspendTenant");
Check(!(await api.SubscriptionReportAsync(60)).Single(r => r.TenantId == T).NeedsAttention, "Report: a suspended tenant needs no attention");
Check((await api.ActivateTenantAsync(T)).Status == TenantStatus.Active, "ActivateTenant");
await Expect(404, () => api.SuspendTenantAsync("nobody"), "SuspendTenant unknown");

var renamed = await api.UpdateTenantAsync(T, new UpdateTenantRequest { Name = "Renamed", Hosts = ["subtest.localhost"] });
Check(renamed.Name == "Renamed" && renamed.Hosts?.Single() == "subtest.localhost", "UpdateTenant");
var provision = await api.ProvisionTenantAsync(T);
Check(provision.Tenant == T && !provision.Created, "ProvisionTenant (already there)");
Check((await api.GetTenantAsync(T)).Name == "Renamed", "GetTenant");

var request = new HttpRequestMessage(HttpMethod.Get, "api/tenancy/current");
var tenantClient = new HttpClient { BaseAddress = http.BaseAddress };
tenantClient.DefaultRequestHeaders.Authorization = http.DefaultRequestHeaders.Authorization;
tenantClient.DefaultRequestHeaders.Add("X-Tenant", "acme");
var current = await new TenancyClient(tenantClient).GetCurrentAsync();
Check(current.Tenant?.Id == "acme" && current.ResolvedBy is not null, $"GetCurrent with X-Tenant -> {current.Tenant?.Id} by {current.ResolvedBy}");
await Expect(404, () => api.GetCurrentAsync(), "GetCurrent without a tenant");

Console.WriteLine(failures == 0 ? "ALL PASS" : $"{failures} FAILED");
return failures;
