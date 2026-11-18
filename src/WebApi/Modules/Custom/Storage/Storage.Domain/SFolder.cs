using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.Storage.Domain;

public sealed class SFolder : AggregateRoot<Guid>, ITenantOwned
{
  public String TenantId { get; set; }

  public String Name { get; set; } = null!;
  public Guid? ParentId { get; set; }
  public SFolder? Parent { get; set; }

  public ICollection<SFolder> Children { get; set; } = new List<SFolder>();
  public List<SFile> Files { get; set; } = new();
}
