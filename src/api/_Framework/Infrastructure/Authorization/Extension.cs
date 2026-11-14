using Microsoft.Extensions.DependencyInjection;
using NJsonSchema;
using NSwag;
using NSwag.Generation.AspNetCore;
using NSwag.Generation.Processors;

namespace soft.square.net.ModularBlazor.Infrastructure.Authorization;

internal static class Extension
{
  internal static AspNetCoreOpenApiDocumentGeneratorSettings AddSecuritySchemes(this AspNetCoreOpenApiDocumentGeneratorSettings settings)
  {
    settings.AddSecurity("JWT", new OpenApiSecurityScheme
    {
      Type = OpenApiSecuritySchemeType.Http,
      Scheme = "bearer",
      BearerFormat = "JWT",
      Description = "Token from POST /api/v1/identity/tokens."
    });
    settings.AddSecurity("ApiKey", new OpenApiSecurityScheme
    {
      Type = OpenApiSecuritySchemeType.ApiKey,
      In = OpenApiSecurityApiKeyLocation.Header,
      Name = "X-API-Key",
      Description = "Key from POST /api/v1/identity/api-keys."
    });
    // These are Minimal API endpoints: detect their RequireAuthorization / RequirePermission metadata
    // directly so Scalar knows to send the configured credentials when an operation is executed.
    settings.OperationProcessors.Add(new EndpointSecurityOperationProcessor());

    // Every operation, including POST /api/v1/identity/tokens, runs for one tenant: the X-Tenant header (default: root).
    settings.OperationProcessors.Add(new OperationProcessor(context =>
    {
      context.OperationDescription.Operation.Parameters.Add(new OpenApiParameter
      {
        Name = "X-Tenant",
        Kind = OpenApiParameterKind.Header,
        Type = JsonObjectType.String,
        IsRequired = false,
        Description = "Tenant id or identifier. Omit for the root tenant. A JWT only works for the tenant it was issued for."
      });
      return true;
    }));
    return settings;
  }
}
