using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Scalar.AspNetCore;
using soft.square.net.ModularBlazor.Infrastructure.Authorization;
namespace soft.square.net.ModularBlazor.Infrastructure.OpenApi;

internal static class Extension
{
  private static string elsaBasePath = "/elsa/api";
  internal static IServiceCollection ConfigureOpenApi(this IServiceCollection services, IConfiguration configuration)
  {
    // NSwag builds the OpenAPI document from the minimal API endpoints.
    services.AddEndpointsApiExplorer();
    // Elsa's endpoints live in their own document ("elsa"); see OpenApiDocuments.cs.
    elsaBasePath = configuration["ElsaHost:ApiBasePath"] ?? "/elsa/api";

    ///// 1. Register the filtered document in Program.cs
    services.AddOpenApiDocument(settings =>
    {
      settings.DocumentName = "elsa";
      settings.Title = "Elsa V3 Workflows API";
      settings.Version = "v3";
      settings.Description = "The embedded Elsa workflow engine API.";

      settings.AddSecuritySchemes();

      // This extension tells NSwag to include FastEndpoints routes
      // settings.EnableFastEndpoints(options => { }, builder.Services.BuildServiceProvider());
      // Skip heavy activity model reflection

      // settings.SchemaSettings.SchemaProcessors.Add(new SafeElsaSchemaProcessor());

      // Elsa registers FastEndpoints rather than MVC controllers, so filter by the
      // mounted API route instead of ControllerType.Namespace.
      settings.OperationProcessors.Insert(0, new ElsaApiOperationProcessor(elsaBasePath, includeElsa: true));

    });
    services.AddOpenApiDocument(settings =>
    {
      settings.DocumentName = "v1";
      settings.Title = "Modular Blazor API";
      settings.Version = "v1";
      settings.Description = "Identity (users, roles, API keys), tenants and module catalog for the Modular Blazor WebAssembly client.";
      settings.AddSecuritySchemes();
      settings.OperationProcessors.Insert(0, new ElsaApiOperationProcessor(elsaBasePath, includeElsa: false));
    });
    return services;
  }

  internal static WebApplication UseOpenApi(this WebApplication app)
  {
    // API documentation (on in Development, or anywhere with Documentation:Enabled=true).
    if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("Documentation:Enabled"))
    {
      // 1. Serve only the NSwag v1 document here. The Elsa document is generated
      // by the custom endpoint below and must not be intercepted by NSwag.
      app.UseOpenApi(settings => settings.Path = "/openapi/v1.json");
      app.UseOpenApi(settings => settings.Path = "/swagger/v3/swagger.json");


      app.MapGet("/openapi/elsa.json", (IEnumerable<EndpointDataSource> endpointSources) =>
          Results.Json(ElsaOpenApiDocumentGenerator.Generate(elsaBasePath, endpointSources)))
          .ExcludeFromDescription();



      // 3. Scalar at /scalar, with both NSwag documents in its selector. A failure in the Elsa document cannot affect v1.
      app.MapScalarApiReference(options => options
          .WithTitle("Modular Blazor API")
          .AddDocument("v1", "Modular V1 Blazor API", "/openapi/v1.json", isDefault: true)
          .AddDocument("elsa", "Elsa V3 Workflows API", "/openapi/elsa.json")
          // Both documents declare the JWT (Bearer) and ApiKey (X-API-Key) schemes; Scalar's Authentication panel
          // offers both, and keeps what you entered across reloads and when switching documents.
          .AddPreferredSecuritySchemes("JWT", "ApiKey")
          // .WithPersistentAuthentication());
          .EnablePersistentAuthentication());


      app.MapGet("/", () => Results.Redirect("/scalar")).ExcludeFromDescription();
    }
    return app;
  }
}
