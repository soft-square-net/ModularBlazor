//using NSwag.Generation.Processors;
//using NSwag.Generation.Processors.Contexts;
//using System;
//using System.Collections.Generic;
//using System.Text;

//namespace soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Infrastructure.OpenApi;

//// Custom operation processor implementation
//public class ElsaCustomParameterIdProcessor :IOperationProcessor
//{
//  public bool Process(OperationProcessorContext context)
//  {
//    foreach (var parameter in context.OperationDescription.Operation.Parameters)
//    {
//      // Intercept parameter variables ending with "id" or "Id" (like workflowDefinitionId, activityId)
//      if (parameter.Name.EndsWith("id", StringComparison.OrdinalIgnoreCase) && parameter.Name.Length > 2)
//      {
//        parameter.Name = "id";
//      }
//    }
//    return true;
//  }
//}