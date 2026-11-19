using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.WebAssembly.Authentication;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Abstractions.MudTail;
using soft.square.net.WebApi.Modules.Core.Tenancy.Client;

namespace soft.square.net.Module.Tenants;

/// <summary>
/// What both pages share: the Tenancy client on the host's "WebApi" HttpClient (the gateway, with the OpenIddict access
/// token), one-call-at-a-time state, readable error messages, and the date conventions of subscriptions.
/// </summary>
public abstract class TenancyPageBase : ComponentBase
{
    [Inject] protected IHttpClientFactory HttpClients { get; set; } = default!;
    [Inject] protected MudTailRuntime MudTail { get; set; } = default!;
    [Inject] protected NavigationManager Nav { get; set; } = default!;

    /// <summary>Tenancy routes (/api/tenancy/...) reach the core pool through the gateway's catch-all route.</summary>
    protected TenancyClient Tenancy => new(HttpClients.CreateClient(HttpClientNames.WebApi));

    protected bool Busy { get; private set; }
    protected string? Error { get; set; }

    /// <summary>Runs one API call: busy flag, error message and toast, and <paramref name="then"/> when it succeeded.</summary>
    protected async Task<bool> RunAsync(Func<Task> call, Func<Task>? then = null)
    {
        Busy = true;
        Error = null;
        StateHasChanged();
        try
        {
            await call();
        }
        catch (AccessTokenNotAvailableException ex)
        {
            ex.Redirect(); // the session ended: sign in again and come back
            return false;
        }
        catch (Exception ex)
        {
            Error = Describe(ex);
            await MudTail.ToastAsync(Error, "error");
            return false;
        }
        finally
        {
            Busy = false;
            StateHasChanged();
        }

        if (then is not null) await then();
        StateHasChanged();
        return true;
    }

    protected static string Describe(Exception ex) => ex switch
    {
        TenancyApiException<HttpValidationProblemDetails> v =>
            $"{v.StatusCode}: {v.Result.Detail ?? v.Result.Title ?? "invalid request"}"
            + (v.Result.Errors is { Count: > 0 } errors ? " " + string.Join(" ", errors.SelectMany(e => e.Value)) : ""),
        TenancyApiException<ProblemDetails> p => $"{p.StatusCode}: {p.Result.Detail ?? p.Result.Title ?? "request failed"}",
        TenancyApiException { StatusCode: 401 } => "401: the gateway did not accept the access token. Sign in again.",
        TenancyApiException { StatusCode: 403 } => "403: your account may not manage tenants (platform.tenants.manage).",
        TenancyApiException { StatusCode: 503 } => "503: the tenant store is not configured on the WebApi.",
        TenancyApiException api => $"{api.StatusCode}: {FirstLine(api.Response) ?? FirstLine(api.Message)}",
        HttpRequestException http => $"The gateway is not reachable ({http.Message}).",
        _ => ex.Message,
    };

    private static string? FirstLine(string? text)
        => string.IsNullOrWhiteSpace(text) ? null : text.Split('\n', 2)[0].Trim();

    // ------------------------------------------------------------ dates
    // A subscription covers [StartsAt, EndsAt): EndsAt is exclusive. The forms ask for the first and the last day
    // (inclusive, UTC), so "1 Jan to 31 Dec" is stored as StartsAt 1 Jan 00:00Z and EndsAt 1 Jan of the next year.

    protected static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);

    protected static DateTimeOffset StartOf(DateOnly day) => new(day.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

    protected static DateTimeOffset EndAfter(DateOnly lastDay) => StartOf(lastDay.AddDays(1));

    protected static DateOnly FirstDay(DateTimeOffset startsAt) => DateOnly.FromDateTime(startsAt.UtcDateTime);

    protected static DateOnly LastDay(DateTimeOffset endsAt) => DateOnly.FromDateTime(endsAt.UtcDateTime.AddTicks(-1));

    protected static string Iso(DateOnly day) => day.ToString("yyyy-MM-dd");
}
