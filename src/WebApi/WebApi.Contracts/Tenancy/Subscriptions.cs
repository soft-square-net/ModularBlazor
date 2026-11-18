using System.Text.Json.Serialization;

namespace soft.square.net.WebApi.Contracts.Tenancy;

/// <summary>
/// Where a subscription stands at a point in time. Informational only: a tenant whose subscription ended keeps working
/// until a platform admin suspends it (<see cref="TenantStatus.Suspended"/>).
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<SubscriptionState>))]
public enum SubscriptionState
{
    /// <summary>Starts in the future.</summary>
    Upcoming,
    /// <summary>Covers now.</summary>
    Current,
    /// <summary>Its end is in the past.</summary>
    Ended,
    /// <summary>Cancelled by an admin; it no longer counts, whatever its dates.</summary>
    Cancelled
}

/// <summary>
/// A paid (or granted) period of a tenant: from <see cref="StartsAt"/> (inclusive) to <see cref="EndsAt"/> (exclusive).
/// A tenant's subscriptions that are not cancelled never overlap.
/// </summary>
public sealed record TenantSubscription(
    Guid Id,
    string TenantId,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    string? Plan,
    string? Notes,
    SubscriptionState State,
    DateTimeOffset CreatedAt,
    string? CreatedBy,
    DateTimeOffset? CancelledAt,
    string? CancelledBy,
    string? CancelReason);

/// <summary>
/// One row of the subscription report: a tenant, its current and next subscription, and whether an admin should look at it.
/// </summary>
/// <param name="EndsAt">When the tenant's covered time runs out: the end of the last subscription that follows on
/// from the current one without a gap; null when no subscription covers now.</param>
/// <param name="DaysLeft">Whole days until <paramref name="EndsAt"/>; null when nothing covers now.</param>
/// <param name="LastEndedAt">End of the most recent subscription that has ended (not cancelled).</param>
/// <param name="NeedsAttention">The tenant is Active but nothing covers now, or its covered time ends within the
/// report's window. The platform does not suspend tenants by itself: this is the admin's to-do list.</param>
public sealed record TenantSubscriptionStatus(
    string TenantId,
    string TenantName,
    TenantStatus TenantStatus,
    TenantSubscription? Current,
    TenantSubscription? Next,
    DateTimeOffset? EndsAt,
    int? DaysLeft,
    DateTimeOffset? LastEndedAt,
    bool NeedsAttention);
