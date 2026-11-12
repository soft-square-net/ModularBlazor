using System.Text.RegularExpressions;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Content.Domain;

/// <summary>A press (newspaper or magazine) of the tenant. Its id is a slug and appears in grant scopes as <c>press:{id}</c>.</summary>
public sealed partial class Press : AggregateRoot<string>, ITenantOwned
{
    private Press() { } // EF Core

    public string TenantId { get; set; } = "";
    public string Name { get; private set; } = "";

    public static Press Create(string id, string name) => new() { Id = Slugs.Require(id, "press"), Name = Names.Require(name, "press") };

    public void Rename(string name) => Name = Names.Require(name, "press");
}

/// <summary>
/// A category of one press. Category ids are unique within the tenant (e.g. <c>ahram-sports</c>), so a grant scope
/// <c>category:{id}</c> names exactly one category even when a shift section spans presses.
/// </summary>
public sealed class Category : AggregateRoot<string>, ITenantOwned
{
    private Category() { } // EF Core

    public string TenantId { get; set; } = "";
    public string PressId { get; private set; } = "";
    public string Name { get; private set; } = "";

    public static Category Create(string id, string pressId, string name) =>
        new() { Id = Slugs.Require(id, "category"), PressId = Slugs.Require(pressId, "press"), Name = Names.Require(name, "category") };

    public void Rename(string name) => Name = Names.Require(name, "category");
}

internal static partial class Slugs
{
    public static string Require(string value, string what) =>
        value is not null && Slug().IsMatch(value) ? value : throw new DomainException($"A {what} id is lowercase letters, digits and '-' (at most 64).");

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,63}$")]
    private static partial Regex Slug();
}

internal static class Names
{
    public static string Require(string value, string what) =>
        !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= 200 ? value.Trim() : throw new DomainException($"A {what} needs a name (at most 200 characters).");
}
