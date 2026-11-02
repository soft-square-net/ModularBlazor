using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

public static class Roles
{
    public const string Admin = "admin";
    public const string User = "user";
}

/// <summary>A person who can sign in. Aggregate root of the Auth module.</summary>
public sealed class User : AuditableAggregateRoot<Guid>
{
    private User() { } // EF Core

    public string UserName { get; private set; } = "";

    /// <summary>Upper-cased UserName; what lookups compare, so they are case-insensitive on every database.</summary>
    public string NormalizedUserName { get; private set; } = "";

    public string Role { get; private set; } = Roles.User;
    public DateTime? LastLoginUtc { get; private set; }

    public static string Normalize(string userName) => userName.Trim().ToUpperInvariant();

    public static User Register(string userName, string role)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(userName);
        ArgumentException.ThrowIfNullOrWhiteSpace(role);

        return new User
        {
            Id = Guid.NewGuid(),
            UserName = userName.Trim(),
            NormalizedUserName = Normalize(userName),
            Role = role
        };
    }

    /// <summary>Demo rule: the user name "admin" is an administrator, everyone else a normal user.</summary>
    public static string RoleFor(string userName)
        => Normalize(userName) == Normalize("admin") ? Roles.Admin : Roles.User;

    public void RecordLogin(DateTime utcNow) => LastLoginUtc = utcNow;
}
