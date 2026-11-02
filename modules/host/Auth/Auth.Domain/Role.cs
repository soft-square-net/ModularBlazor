using soft.square.net.ModularBlazor.Core.Domain;
using soft.square.net.ModularBlazor.Core.Exceptions;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

/// <summary>A named set of permissions that can be granted to users. Aggregate root of the Auth module.</summary>
public sealed class Role : AuditableAggregateRoot<Guid>
{
    private readonly List<RolePermission> _permissions = [];

    private Role() { } // EF Core

    public string Name { get; private set; } = "";
    public string NormalizedName { get; private set; } = "";
    public string? Description { get; private set; }

    /// <summary>System roles (admin, basic) can be given other permissions but are never renamed or deleted.</summary>
    public bool IsSystem { get; private set; }

    public IReadOnlyCollection<RolePermission> Permissions => _permissions;

    public static string Normalize(string value) => value.Trim().ToUpperInvariant();

    public static Role Create(string name, string? description, bool isSystem = false)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        return new Role
        {
            Id = Guid.NewGuid(),
            Name = name.Trim(),
            NormalizedName = Normalize(name),
            Description = description?.Trim(),
            IsSystem = isSystem
        };
    }

    public void Update(string name, string? description)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        if (IsSystem && Normalize(name) != NormalizedName)
            throw new ConflictException($"The system role '{Name}' cannot be renamed.");

        Name = name.Trim();
        NormalizedName = Normalize(name);
        Description = description?.Trim();
    }

    /// <summary>Throws when the role must not be deleted.</summary>
    public void EnsureDeletable()
    {
        if (IsSystem)
            throw new ConflictException($"The system role '{Name}' cannot be deleted.");
    }

    /// <summary>Makes the role's permissions exactly the given set.</summary>
    public void SetPermissions(IEnumerable<string> permissions)
    {
        var wanted = permissions.ToHashSet(StringComparer.Ordinal);
        _permissions.RemoveAll(p => !wanted.Contains(p.Permission));

        foreach (var permission in wanted.Where(w => _permissions.All(p => p.Permission != w)))
            _permissions.Add(new RolePermission(Id, permission));
    }
}

/// <summary>A permission granted to a role (owned by the Role aggregate).</summary>
public sealed class RolePermission
{
    private RolePermission() { } // EF Core

    internal RolePermission(Guid roleId, string permission)
    {
        RoleId = roleId;
        Permission = permission;
    }

    public Guid RoleId { get; private set; }
    public string Permission { get; private set; } = "";
}
