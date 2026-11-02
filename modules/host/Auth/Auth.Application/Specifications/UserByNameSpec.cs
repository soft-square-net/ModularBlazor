using Ardalis.Specification;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Specifications;

public sealed class UserByNameSpec : Specification<User>
{
    public UserByNameSpec(string userName)
    {
        var normalized = User.Normalize(userName);
        Query.Where(u => u.NormalizedUserName == normalized);
    }
}
