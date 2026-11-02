using System.Reflection;

namespace soft.square.net.ModularBlazor.Core.Authorization;

/// <summary>Names of the claims in access tokens (short names: inbound claim mapping is off).</summary>
public static class ClaimNames
{
    public const string Subject = "sub";
    public const string Name = "name";
    public const string Email = "email";
    public const string Role = "role";
    public const string Permission = "permission";
    public const string Tenant = "tenant";
}

/// <summary>The permissions endpoints can require (`.RequirePermission(...)`). Roles are granted sets of these.</summary>
public static class Permissions
{
    public static class Users
    {
        public const string View = "Permissions.Identity.Users.View";
        public const string Create = "Permissions.Identity.Users.Create";
        public const string Update = "Permissions.Identity.Users.Update";
        public const string Delete = "Permissions.Identity.Users.Delete";
    }

    public static class Roles
    {
        public const string View = "Permissions.Identity.Roles.View";
        public const string Create = "Permissions.Identity.Roles.Create";
        public const string Update = "Permissions.Identity.Roles.Update";
        public const string Delete = "Permissions.Identity.Roles.Delete";
    }

    public static class ApiKeys
    {
        public const string View = "Permissions.Identity.ApiKeys.View";
        public const string Create = "Permissions.Identity.ApiKeys.Create";
        public const string Revoke = "Permissions.Identity.ApiKeys.Revoke";
    }

    public static class Tenants
    {
        public const string View = "Permissions.Multitenancy.Tenants.View";
        public const string Create = "Permissions.Multitenancy.Tenants.Create";
        public const string Update = "Permissions.Multitenancy.Tenants.Update";
    }

    public static class Workflows
    {
        /// <summary>Read workflows through the embedded Elsa API (GET).</summary>
        public const string View = "Permissions.Workflows.View";
        /// <summary>Create, change, publish and run workflows through the embedded Elsa API.</summary>
        public const string Manage = "Permissions.Workflows.Manage";
    }

    /// <summary>Every permission above.</summary>
    public static IReadOnlyList<string> All { get; } = typeof(Permissions)
        .GetNestedTypes(BindingFlags.Public)
        .SelectMany(t => t.GetFields(BindingFlags.Public | BindingFlags.Static))
        .Where(f => f.IsLiteral && f.FieldType == typeof(string))
        .Select(f => (string)f.GetRawConstantValue()!)
        .OrderBy(p => p, StringComparer.Ordinal)
        .ToList();
}

public static class RoleNames
{
    public const string Admin = "admin";
    public const string Basic = "basic";
}
