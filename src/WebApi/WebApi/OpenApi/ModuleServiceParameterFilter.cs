using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using soft.square.net.WebApi.Modularity;

namespace soft.square.net.WebApi.OpenApi;

/// <summary>
/// Module endpoints resolve their services from the module's container, which ApiExplorer cannot see: it asks the host's
/// container and describes every unknown complex parameter (GreetingService, UserDirectory, ...) as a JSON request body.
/// The request delegate was built against the module container and knows better: when it declared no body
/// (no <see cref="IAcceptsMetadata"/>), the inferred body parameters are services and are dropped from the description.
/// That also keeps module service types out of the OpenAPI schema caches.
/// </summary>
internal sealed class ModuleServiceParameterFilter : IApiDescriptionProvider
{
    // After EndpointMetadataApiDescriptionProvider (-1100); OnProvidersExecuted runs once every provider has added its descriptions.
    public int Order => -1000;

    public void OnProvidersExecuting(ApiDescriptionProviderContext context) { }

    public void OnProvidersExecuted(ApiDescriptionProviderContext context)
    {
        foreach (var description in context.Results)
        {
            var metadata = description.ActionDescriptor.EndpointMetadata;
            if (!metadata.OfType<RuntimeModuleMetadata>().Any() || metadata.OfType<IAcceptsMetadata>().Any()) continue;

            var removed = 0;
            for (var i = description.ParameterDescriptions.Count - 1; i >= 0; i--)
            {
                if (description.ParameterDescriptions[i].Source != BindingSource.Body) continue;
                description.ParameterDescriptions.RemoveAt(i);
                removed++;
            }
            if (removed > 0) description.SupportedRequestFormats.Clear();
        }
    }
}
