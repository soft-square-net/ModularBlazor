using NSwag.Generation.Processors;
using NSwag.Generation.Processors.Contexts;

namespace soft.square.net.ModularBlazor.Infrastructure.OpenApi;

internal sealed class ElsaApiOperationProcessor(string elsaBasePath, bool includeElsa) : IOperationProcessor
{
  public bool Process(OperationProcessorContext context)
  {
    // var isElsa = context.OperationDescription.Path.StartsWith(elsaBasePath, StringComparison.OrdinalIgnoreCase);
    var isElsa = context.OperationDescription.Path.Contains("elsa/", StringComparison.OrdinalIgnoreCase);
    return isElsa == includeElsa;
  }
}
