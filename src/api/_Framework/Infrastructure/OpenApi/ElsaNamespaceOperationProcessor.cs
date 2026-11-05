using NSwag.Generation.Processors;
using NSwag.Generation.Processors.Contexts;
using System;
using System.Collections.Generic;
using System.Text;

namespace soft.square.net.ModularBlazor.Infrastructure.OpenApi;

internal sealed class ElsaNamespaceOperationProcessor : IOperationProcessor
{
  private readonly string _allowedNamespace;

  public ElsaNamespaceOperationProcessor(string allowedNamespace)
  {
    _allowedNamespace = allowedNamespace;
  }

  public bool Process(OperationProcessorContext context)
  {
    //if (context is not AspNetCoreOperationProcessorContext aspNetCoreContext)
    //  return false;
    //var controllerType = aspNetCoreContext.ControllerType;
    //if (controllerType?.Namespace == null)
    //  return false;

    //return controllerType.Namespace.StartsWith(_allowedNamespace, StringComparison.OrdinalIgnoreCase);
    HashSet<string> _processedPaths = new();
    if (context.ControllerType?.Namespace == null) return false;
    if (!context.ControllerType.Namespace.StartsWith(_allowedNamespace)) return false;
    string path = context.OperationDescription?.Path;
    if (path != null && !_processedPaths.Add(path))
    {
      return false;
    }
    return true;
  }
}

