extern alias client;
extern alias server;
using System.Net;
using System.Text;
using System.Text.Json;
using C = client::soft.square.net.WebApi.Modules.Content.Client;
using SA = server::soft.square.net.WebApi.Modules.Content.Application;
using SD = server::soft.square.net.WebApi.Modules.Content.Domain;

// Minimal APIs use the web defaults: camelCase, case-insensitive, numbers from strings.
var web = new JsonSerializerOptions(JsonSerializerDefaults.Web);
int failures = 0;
void Check(bool ok, string what) { Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {what}"); if (!ok) failures++; }

var handler = new Fake();
var api = new C.ContentClient(new HttpClient(handler) { BaseAddress = new Uri("https://gateway.test/") });
JsonElement J(string json) => JsonDocument.Parse(json).RootElement.Clone();

// ---- Requests: client body -> server record (what the endpoint binds) ----
var doc = new C.PostDocument
{
    SchemaId = "article", SchemaVersion = 2, Content = J("{\"lead\":\"hi\",\"n\":3}"), Style = J("{}"),
    Children = new List<C.PostNode> { new() { NodeId = "n1", PostKind = C.PostKind.Video, SchemaId = "video", SchemaVersion = 1, Content = J("{\"url\":\"u\"}"), Style = J("{}"), Children = new List<C.PostNode>() } }
};
handler.Respond(Server(typeof(SA.PostDetail)));
await api.CreatePostAsync(new C.NewPost { CategoryId = "cat-1", Title = "Title", Body = null, PostKind = C.PostKind.News, Document = doc });
Console.WriteLine("  client sent: " + handler.LastBody);
var newPost = JsonSerializer.Deserialize<SA.NewPost>(handler.LastBody!, web)!;
Check(handler.Last == "POST https://gateway.test/api/content/posts", "CreatePost: " + handler.Last);
Check(newPost is { CategoryId: "cat-1", Title: "Title", Body: null, PostKind: SD.PostKind.News }, "NewPost fields and enum name bind on the server");
Check(newPost.Document is { SchemaId: "article", SchemaVersion: 2 } d && d.Content.GetProperty("n").GetInt32() == 3
      && d.Children.Count == 1 && d.Children[0].PostKind == SD.PostKind.Video, "PostDocument with JsonElement content and child nodes binds");

handler.Respond(Server(typeof(SA.PostDetail)));
await api.SchedulePostAsync(7, new C.ScheduleRequest { Version = 4, PublishAt = new DateTimeOffset(2026, 11, 20, 8, 0, 0, TimeSpan.FromHours(2)) });
var schedule = JsonDocument.Parse(handler.LastBody!).RootElement;
Check(handler.Last.EndsWith("/api/content/posts/7/schedule") && schedule.GetProperty("version").GetInt32() == 4
      && schedule.GetProperty("publishAt").GetDateTimeOffset() == new DateTimeOffset(2026, 11, 20, 6, 0, 0, TimeSpan.Zero),
      "ScheduleRequest: route id, version, offset-preserving time");

handler.Respond(Server(typeof(SA.PostDetail)));
await api.EditPostAsync(7, new C.PostEdit { Version = 5, Title = "New", Body = "b" });
Console.WriteLine("  client sent: " + handler.LastBody);
var edit = JsonSerializer.Deserialize<SA.PostEdit>(handler.LastBody!, web)!;
Check(handler.Last.StartsWith("PUT ") && edit is { Version: 5, Title: "New", Body: "b", Document: null }, "PostEdit via PUT binds");

handler.Respond("[]");
await api.ListPostsAsync(C.PostView.Desk);
Check(handler.Last.EndsWith("/api/content/posts?view=Desk"), "view query uses the enum name: " + handler.Last);
handler.Respond("[]");
await api.ListPostsAsync();
Check(handler.Last.EndsWith("/api/content/posts"), "no view: no query string (" + handler.Last + ")");

// ---- Responses: server record JSON -> client type ----
foreach (var (type, call) in new (Type, Func<Task<object>>)[]
{
    (typeof(SA.PostDetail), async () => await api.GetPostAsync(1)),
    (typeof(SA.PublishedPost), async () => await api.GetPublishedPostAsync("p-1")),
})
{
    var json = Server(type); handler.Respond(json);
    var result = await call();
    var back = JsonSerializer.Serialize(result, result.GetType(), web);
    var missing = Keys(json).Except(Keys(back)).ToList();
    Check(missing.Count == 0, $"{type.Name}: every server field reaches the client{(missing.Count > 0 ? " - missing " + string.Join(",", missing) : "")}");
}
handler.Respond("[" + Server(typeof(SA.PostSummary)) + "]");
var list = await api.ListPostsAsync();
Check(list.Count == 1 && list[0].State == C.PostState.AwaitingDeskReapproval, "PostSummary list with enum names");

// ---- Errors ----
handler.Respond("{\"title\":\"Conflict\",\"status\":409,\"detail\":\"Someone else changed this Post first\"}", HttpStatusCode.Conflict);
try { await api.PublishPostAsync(1, new C.VersionRequest { Version = 1 }); Check(false, "409 throws"); }
catch (C.ContentApiException e) { Check(e.StatusCode == 409 && e.Response!.Contains("Someone else"), "409 problem details surface as ContentApiException"); }

Console.WriteLine(failures == 0 ? "ALL PASSED" : $"{failures} FAILED");
return failures;

static IEnumerable<string> Keys(string json) => JsonDocument.Parse(json).RootElement.EnumerateObject().Select(p => p.Name);

// A server record filled with sample values, serialized the way the endpoint does.
static string Server(Type type) => JsonSerializer.Serialize(Fill(type), type, new JsonSerializerOptions(JsonSerializerDefaults.Web));

static object? Fill(Type t)
{
    if (t == typeof(string)) return "s";
    if (t == typeof(int)) return 3;
    if (t == typeof(bool)) return true;
    if (t == typeof(DateTimeOffset)) return new DateTimeOffset(2026, 11, 18, 10, 0, 0, TimeSpan.Zero);
    if (t == typeof(JsonElement)) return JsonDocument.Parse("{\"k\":1}").RootElement.Clone();
    if (t == typeof(SD.PostState)) return SD.PostState.AwaitingDeskReapproval;
    if (t.IsEnum) return Enum.GetValues(t).GetValue(1);
    if (Nullable.GetUnderlyingType(t) is { } u) return Fill(u);
    if (t.IsGenericType && t.GetGenericArguments().Length == 1 && typeof(System.Collections.IEnumerable).IsAssignableFrom(t))
    {
        var item = t.GetGenericArguments()[0];
        var array = Array.CreateInstance(item, item == typeof(SD.PostNode) ? 0 : 1);
        if (array.Length == 1) array.SetValue(Fill(item), 0);
        return array;
    }
    var ctor = t.GetConstructors().OrderByDescending(c => c.GetParameters().Length).First();
    return ctor.Invoke(ctor.GetParameters().Select(p => Fill(p.ParameterType)).ToArray());
}

sealed class Fake : HttpMessageHandler
{
    private string _json = "{}";
    private HttpStatusCode _status = HttpStatusCode.OK;
    public string Last = "";
    public string? LastBody;

    public void Respond(string json, HttpStatusCode status = HttpStatusCode.OK) { _json = json; _status = status; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Last = $"{request.Method} {request.RequestUri}";
        LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
        var created = _status == HttpStatusCode.OK && request.Method == HttpMethod.Post && request.RequestUri!.AbsolutePath == "/api/content/posts";
        return new HttpResponseMessage(created ? HttpStatusCode.Created : _status) { Content = new StringContent(_json, Encoding.UTF8, "application/json") };
    }
}
