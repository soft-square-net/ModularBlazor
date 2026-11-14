using Microsoft.AspNetCore.Authorization;
using NSwag;
using NSwag.Generation.AspNetCore;
using NSwag.Generation.Processors;
using NSwag.Generation.Processors.Contexts;

namespace soft.square.net.ModularBlazor.Infrastructure.Authorization;

/// <summary>Reflects Minimal API authorization metadata in OpenAPI so Scalar sends credentials for protected operations.</summary>
internal sealed class EndpointSecurityOperationProcessor : IOperationProcessor
{
    public bool Process(OperationProcessorContext context)
    {
        if (context is not AspNetCoreOperationProcessorContext aspNetCoreContext)
            return true;

        var metadata = aspNetCoreContext.ApiDescription.ActionDescriptor.EndpointMetadata;
        if (metadata?.OfType<IAllowAnonymous>().Any() == true ||
            metadata?.OfType<IAuthorizeData>().Any() != true)
            return true;

        var security = context.OperationDescription.Operation.Security;
        security.Add(new OpenApiSecurityRequirement { ["JWT"] = Array.Empty<string>() });
        security.Add(new OpenApiSecurityRequirement { ["ApiKey"] = Array.Empty<string>() });
        return true;
    }
}
