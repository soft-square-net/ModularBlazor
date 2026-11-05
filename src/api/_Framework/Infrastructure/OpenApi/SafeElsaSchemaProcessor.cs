using NJsonSchema.Generation;
using System;
using System.Collections.Generic;
using System.Text;

namespace soft.square.net.ModularBlazor.Infrastructure.OpenApi;

public sealed class SafeElsaSchemaProcessor : ISchemaProcessor
{
  public void Process(SchemaProcessorContext context)
  {
    var typeName = context.Type.Name;

    // Skip problematic activity or dynamic variable types that trigger reflection loops
    if (typeName.Contains("Activity") || typeName.Contains("IActivity") || typeName.Contains("WorkflowGraph"))
    {
      // Clear schema properties to prevent deep recursive tree scanning
      context.Schema.Properties.Clear();
    }
  }
}