using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Infrastructure.Http;

/// <summary>Talks to /api/v1/modules/... with the signed-in user's token (the authenticated API client).</summary>
public sealed class ModuleAdminApi(IHttpClientFactory httpClients) : IModuleAdminApi
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    private HttpClient Client => httpClients.CreateClient(ApiClientNames.Authenticated);

    // ---------------------------------------------------------------- client modules

    public async Task<ModuleInspectionDto> InspectAsync(Stream file, string fileName, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        form.Add(FileContent(file), "File", fileName);
        return await ReadAsync<ModuleInspectionDto>(await Client.PostAsync("api/v1/modules/inspections", form, ct), ct);
    }

    public Task<ModuleInspectionDto> GetInspectionAsync(string token, CancellationToken ct = default)
        => GetAsync<ModuleInspectionDto>($"api/v1/modules/inspections/{Uri.EscapeDataString(token)}", ct);

    public async Task<ModuleRegistrationDto> InstallInspectedClientAsync(string token, ModuleRegistrationRequest settings, CancellationToken ct = default)
        => await ReadAsync<ModuleRegistrationDto>(
            await Client.PostAsJsonAsync($"api/v1/modules/inspections/{Uri.EscapeDataString(token)}/install-client", settings, Json, ct), ct);

    public async Task<ModulePackageInfo> InstallInspectedHostAsync(string token, HostModuleSettings settings, CancellationToken ct = default)
        => await ReadAsync<ModulePackageInfo>(
            await Client.PostAsJsonAsync($"api/v1/modules/inspections/{Uri.EscapeDataString(token)}/install-host", settings, Json, ct), ct);

    public async Task DiscardInspectionAsync(string token, CancellationToken ct = default)
        => await EnsureAsync(await Client.DeleteAsync($"api/v1/modules/inspections/{Uri.EscapeDataString(token)}", ct), ct);

    public Task<IReadOnlyList<ModuleRegistrationDto>> ListRegistrationsAsync(CancellationToken ct = default)
        => GetAsync<IReadOnlyList<ModuleRegistrationDto>>("api/v1/modules/registrations", ct);

    public async Task<RegistrationPlanDto> PlanRegistrationAsync(ModuleRegistrationRequest request, CancellationToken ct = default)
        => await ReadAsync<RegistrationPlanDto>(await Client.PostAsJsonAsync("api/v1/modules/registrations/plan", request, Json, ct), ct);

    public async Task<ModuleRegistrationDto> RegisterAsync(Stream file, string fileName, ModuleRegistrationRequest request, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        form.Add(FileContent(file), "File", fileName);
        form.Add(new StringContent(JsonSerializer.Serialize(request, Json)), "Metadata");
        return await ReadAsync<ModuleRegistrationDto>(await Client.PostAsync("api/v1/modules/registrations", form, ct), ct);
    }

    public async Task<ModuleRegistrationDto> UpdateRegistrationAsync(string id, ModuleRegistrationRequest request, CancellationToken ct = default)
        => await ReadAsync<ModuleRegistrationDto>(
            await Client.PutAsJsonAsync($"api/v1/modules/registrations/{Uri.EscapeDataString(id)}", request, Json, ct), ct);

    public async Task<ModuleRegistrationDto> SetRegistrationEnabledAsync(string id, bool enabled, CancellationToken ct = default)
        => await ReadAsync<ModuleRegistrationDto>(
            await Client.PutAsJsonAsync($"api/v1/modules/registrations/{Uri.EscapeDataString(id)}/enabled", new { enabled }, Json, ct), ct);

    public async Task DeleteRegistrationAsync(string id, CancellationToken ct = default)
        => await EnsureAsync(await Client.DeleteAsync($"api/v1/modules/registrations/{Uri.EscapeDataString(id)}", ct), ct);

    // ---------------------------------------------------------------- host modules

    public Task<IReadOnlyList<ModulePackageInfo>> ListHostPackagesAsync(CancellationToken ct = default)
        => GetAsync<IReadOnlyList<ModulePackageInfo>>("api/v1/modules/packages?target=Host", ct);

    public async Task<ModulePackageInfo> UploadHostPackageAsync(Stream file, string fileName, string? name, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        form.Add(FileContent(file), "File", fileName);
        form.Add(new StringContent("Host"), "Target");
        if (!string.IsNullOrWhiteSpace(name)) form.Add(new StringContent(name), "Name");
        return await ReadAsync<ModulePackageInfo>(await Client.PostAsync("api/v1/modules/packages", form, ct), ct);
    }

    public async Task<ModulePackageInfo> SetPackageEnabledAsync(string packageId, bool enabled, CancellationToken ct = default)
        => await ReadAsync<ModulePackageInfo>(
            await Client.PutAsJsonAsync($"api/v1/modules/packages/{Uri.EscapeDataString(packageId)}/enabled", new { enabled }, Json, ct), ct);

    public async Task DeletePackageAsync(string packageId, CancellationToken ct = default)
        => await EnsureAsync(await Client.DeleteAsync($"api/v1/modules/packages/{Uri.EscapeDataString(packageId)}", ct), ct);

    public async Task RestartHostAsync(CancellationToken ct = default)
        => await EnsureAsync(await Client.PostAsync("api/v1/modules/restart", null, ct), ct);

    public async Task<byte[]> DownloadPackageAsync(string packageId, CancellationToken ct = default)
    {
        using var response = await Client.GetAsync($"api/v1/modules/packages/{Uri.EscapeDataString(packageId)}/download", ct);
        await EnsureAsync(response, ct);
        return await response.Content.ReadAsByteArrayAsync(ct);
    }

    // ---------------------------------------------------------------- plumbing

    private static StreamContent FileContent(Stream file)
    {
        var content = new StreamContent(file);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        return content;
    }

    private async Task<T> GetAsync<T>(string url, CancellationToken ct)
        => await ReadAsync<T>(await Client.GetAsync(url, ct), ct);

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, CancellationToken ct)
    {
        using (response)
        {
            await EnsureAsync(response, ct);
            return await response.Content.ReadFromJsonAsync<T>(Json, ct)
                   ?? throw new ModuleAdminException("The API returned an empty answer.", (int)response.StatusCode);
        }
    }

    /// <summary>A failed call becomes a ModuleAdminException carrying the server's problem details.</summary>
    private static async Task EnsureAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;

        var message = $"{(int)response.StatusCode} {response.ReasonPhrase}";
        try
        {
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;
            if (root.TryGetProperty("detail", out var detail) && detail.GetString() is { Length: > 0 } text) message = text;
            else if (root.TryGetProperty("title", out var title) && title.GetString() is { Length: > 0 } t) message = t;
            else if (root.TryGetProperty("errors", out var errors) && errors.ValueKind == JsonValueKind.Object)
                message = string.Join(" ", errors.EnumerateObject().SelectMany(e => e.Value.EnumerateArray().Select(v => v.GetString())));
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException) { /* keep the status line */ }

        throw new ModuleAdminException(message, (int)response.StatusCode);
    }
}
