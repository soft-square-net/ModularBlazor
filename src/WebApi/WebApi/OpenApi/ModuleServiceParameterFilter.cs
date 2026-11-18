using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using soft.square.net.WebApi.Modularity;

namespace soft.square.net.WebApi.OpenApi;

/// <summary>
/// Module endpoints resolve their services from the module's container, which ApiExplorer cannot see: it asks the host's
/// container and describes every unknown complex parameter (GreetingService, PostService, ...) as a JSON request body.
/// The request delegate was built against the module container and knows better: its <see cref="IAcceptsMetadata"/>
/// names the one real body type (none when the endpoint reads no body). Every other inferred body parameter is a service
/// and is dropped from the description. Without this, an endpoint with a body and a service shows two bodies and the
/// document gets no request body at all. It also keeps module service types out of the OpenAPI schema caches.
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
            if (!metadata.OfType<RuntimeModuleMetadata>().Any()) continue;

            var bodyType = metadata.OfType<IAcceptsMetadata>().LastOrDefault()?.RequestType;
            var keptBody = false;
            for (var i = description.ParameterDescriptions.Count - 1; i >= 0; i--)
            {
                var parameter = description.ParameterDescriptions[i];
                if (parameter.Source != BindingSource.Body) continue;
                if (bodyType is not null && parameter.Type == bodyType) { keptBody = true; continue; }
                description.ParameterDescriptions.RemoveAt(i);
            }
            if (!keptBody) description.SupportedRequestFormats.Clear();
        }
    }
}
