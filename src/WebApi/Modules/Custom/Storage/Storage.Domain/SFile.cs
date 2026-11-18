using soft.square.net.WebApi.SharedKernel;
using System;
using System.Collections.Generic;
using System.Text;

namespace soft.square.net.Storage.Domain;

public class SFile: ITenantOwned
{
  public String TenantId { get; set; }
  public String Name { get; set; } = null!;

}
