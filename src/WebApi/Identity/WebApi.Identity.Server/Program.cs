// Identity service: OpenIddict (authorization server) + ASP.NET Core Identity (accounts), its own process and database.
// Issues tenant-bound JWT access tokens for the WebApi pools (audience "modular-webapi"); see README.md.

using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;
using soft.square.net.WebApi.Identity.Server.Admin;
using soft.square.net.WebApi.Identity.Server.Auth;
using soft.square.net.WebApi.Identity.Server.Data;
using static OpenIddict.Abstractions.OpenIddictConstants;

var builder = WebApplication.CreateBuilder(args);

var section = builder.Configuration.GetSection("Identity");
builder.Services.Configure<IdentityServerOptions>(section);
var options = section.Get<IdentityServerOptions>() ?? new IdentityServerOptions();

// ---------------------------------------------------------------- database (PostgreSQL: the "identity" database on tenant-data)
var connectionString = builder.Configuration.GetConnectionString("identity")
    ?? throw new InvalidOperationException("ConnectionStrings:identity is not configured.");
builder.Services.AddDbContext<IdentityDb>(db =>
{
    db.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", IdentityDb.Schema));
    db.UseOpenIddict();
});

// ---------------------------------------------------------------- accounts (ASP.NET Core Identity, cookie for the login UI)
builder.Services.AddIdentity<ApplicationUser, IdentityRole>(o =>
    {
        o.User.RequireUniqueEmail = true;
        o.Lockout.MaxFailedAccessAttempts = 5;
        o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
        // Identity's claim names = OpenIddict's, so the cookie principal reads the same as a token.
        o.ClaimsIdentity.UserNameClaimType = Claims.Name;
        o.ClaimsIdentity.UserIdClaimType = Claims.Subject;
        o.ClaimsIdentity.RoleClaimType = Claims.Role;
        o.ClaimsIdentity.EmailClaimType = Claims.Email;
    })
    .AddEntityFrameworkStores<IdentityDb>()
    .AddDefaultTokenProviders();
builder.Services.ConfigureApplicationCookie(o =>
{
    o.LoginPath = "/Account/Login";
    o.LogoutPath = "/Account/Logout";
    o.Cookie.Name = "modular.identity";
    o.ExpireTimeSpan = TimeSpan.FromHours(8);
    o.SlidingExpiration = true;
});

// ---------------------------------------------------------------- OpenIddict
builder.Services.AddOpenIddict()
    .AddCore(o => o.UseEntityFrameworkCore().UseDbContext<IdentityDb>())
    .AddServer(o =>
    {
        if (options.Issuer is not null) o.SetIssuer(options.Issuer);

        o.SetAuthorizationEndpointUris("connect/authorize")
         .SetTokenEndpointUris("connect/token")
         .SetUserInfoEndpointUris("connect/userinfo")
         .SetEndSessionEndpointUris("connect/endsession")
         .SetRevocationEndpointUris("connect/revoke");

        o.AllowAuthorizationCodeFlow().RequireProofKeyForCodeExchange()
         .AllowClientCredentialsFlow()
         .AllowRefreshTokenFlow();

        o.RegisterScopes(Scopes.OpenId, Scopes.Profile, Scopes.Email, Scopes.OfflineAccess, IdentityClaims.ApiScope);
        o.RegisterClaims(Claims.Subject, Claims.Name, Claims.Email, Claims.Role, IdentityClaims.Tenant, IdentityClaims.Amr);

        o.SetAccessTokenLifetime(options.AccessTokenLifetime)
         .SetRefreshTokenLifetime(options.RefreshTokenLifetime);

        // Plain signed JWTs: resource servers validate them with the public keys from /.well-known/jwks.
        o.DisableAccessTokenEncryption();

        if (builder.Environment.IsDevelopment())
        {
            // Development only: self-signed certificates kept in the current user's certificate store.
            o.AddDevelopmentEncryptionCertificate()
             .AddDevelopmentSigningCertificate();
        }
        else
        {
            // TODO(production keys): load the signing and encryption certificates from a key vault (or the database),
            // publish the next signing key in JWKS before it is used, and rotate on a schedule. Replicas only need the
            // public keys; see README.md "Signing keys".
            o.AddSigningCertificate(LoadCertificate(builder.Configuration, "Identity:SigningCertificate"))
             .AddEncryptionCertificate(LoadCertificate(builder.Configuration, "Identity:EncryptionCertificate"));
        }

        var aspnet = o.UseAspNetCore()
            .EnableAuthorizationEndpointPassthrough()
            .EnableTokenEndpointPassthrough()
            .EnableUserInfoEndpointPassthrough()
            .EnableEndSessionEndpointPassthrough()
            .EnableStatusCodePagesIntegration();
        // The lab serves plain HTTP behind Aspire; production terminates TLS and keeps the requirement.
        if (builder.Environment.IsDevelopment()) aspnet.DisableTransportSecurityRequirement();
    })
    .AddValidation(o =>
    {
        // Bearer tokens for this service's own admin API.
        o.UseLocalServer();
        o.UseAspNetCore();
        o.AddAudiences(IdentityClaims.Audience);
    });

builder.Services.AddScoped<TokenIssuer>();
builder.Services.AddScoped<TenantAuthorizations>();
builder.Services.AddMembershipAdmin();
builder.Services.AddRazorPages();
builder.Services.AddHealthChecks();

// ---------------------------------------------------------------- telemetry (Aspire dashboard)
if (!string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
{
    builder.Logging.AddOpenTelemetry(logging =>
    {
        logging.IncludeFormattedMessage = true;
        logging.IncludeScopes = true;
    });
    builder.Services.AddOpenTelemetry()
        .WithTracing(tracing => tracing.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation())
        .WithMetrics(metrics => metrics.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation().AddRuntimeInstrumentation())
        .UseOtlpExporter();
}

var app = builder.Build();

await IdentitySeeder.InitializeAsync(app.Services);

app.UseStatusCodePages();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health");
app.MapConnectEndpoints();
app.MapMembershipAdmin();
app.MapRazorPages();

app.Run();

static X509Certificate2 LoadCertificate(IConfiguration configuration, string section)
{
    var path = configuration[$"{section}:Path"]
        ?? throw new InvalidOperationException($"{section}:Path is not configured. Outside Development the identity service needs real signing and encryption certificates (see README.md).");
    return X509CertificateLoader.LoadPkcs12FromFile(path, configuration[$"{section}:Password"]);
}
