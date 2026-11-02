using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

/// <summary>A person who can sign in to a tenant. Aggregate root of the Auth module.</summary>
public sealed class User : AuditableAggregateRoot<Guid>
{
    private readonly List<UserRole> _userRoles = [];

    private User() { } // EF Core

    public string UserName { get; private set; } = "";

    /// <summary>Upper-cased UserName / Email: what lookups compare, so they are case-insensitive on every database.</summary>
    public string NormalizedUserName { get; private set; } = "";

    public string Email { get; private set; } = "";
    public string NormalizedEmail { get; private set; } = "";
    public string? FirstName { get; private set; }
    public string? LastName { get; private set; }
    public string PasswordHash { get; private set; } = "";
    public bool IsActive { get; private set; } = true;
    public DateTime? LastLoginUtc { get; private set; }

    public IReadOnlyCollection<UserRole> UserRoles => _userRoles;

    public static string Normalize(string value) => value.Trim().ToUpperInvariant();

    public static User Create(string userName, string email, string passwordHash, string? firstName, string? lastName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(userName);
        ArgumentException.ThrowIfNullOrWhiteSpace(email);
        ArgumentException.ThrowIfNullOrWhiteSpace(passwordHash);

        return new User
        {
            Id = Guid.NewGuid(),
            UserName = userName.Trim(),
            NormalizedUserName = Normalize(userName),
            Email = email.Trim(),
            NormalizedEmail = Normalize(email),
            PasswordHash = passwordHash,
            FirstName = firstName?.Trim(),
            LastName = lastName?.Trim()
        };
    }

    public void UpdateDetails(string email, string? firstName, string? lastName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(email);

        Email = email.Trim();
        NormalizedEmail = Normalize(email);
        FirstName = firstName?.Trim();
        LastName = lastName?.Trim();
    }

    public void SetPasswordHash(string passwordHash)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(passwordHash);
        PasswordHash = passwordHash;
    }

    public void Activate() => IsActive = true;

    public void Deactivate() => IsActive = false;

    public void RecordLogin(DateTime utcNow) => LastLoginUtc = utcNow;

    /// <summary>Makes the user's roles exactly the given set.</summary>
    public void SetRoles(IEnumerable<Guid> roleIds)
    {
        var wanted = roleIds.ToHashSet();
        _userRoles.RemoveAll(r => !wanted.Contains(r.RoleId));

        foreach (var roleId in wanted.Where(id => _userRoles.All(r => r.RoleId != id)))
            _userRoles.Add(new UserRole(Id, roleId));
    }
}

/// <summary>Link between a user and a role (owned by the User aggregate).</summary>
public sealed class UserRole
{
    private UserRole() { } // EF Core

    internal UserRole(Guid userId, Guid roleId)
    {
        UserId = userId;
        RoleId = roleId;
    }

    public Guid UserId { get; private set; }
    public Guid RoleId { get; private set; }
}
