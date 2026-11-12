using soft.square.net.WebApi.Contracts.Security;

namespace soft.square.net.WebApi.Modules.Content.Application;

/// <summary>
/// The content module's permissions. Standing grants (admins): <see cref="Author"/>, <see cref="Editor"/>,
/// <see cref="Manage"/>. Shift grants (written by the shifts module from the rota, valid only during the shift):
/// Manager → accept, assign, transfer, return; Desk → publish, return; Editor → review.
/// </summary>
public static class ContentPermissions
{
    public const string Author = "content.author";
    /// <summary>Standing editor of a category: may also publish an article they wrote or reviewed (no second pair of eyes needed).</summary>
    public const string Editor = "content.editor";
    public const string Accept = "content.accept";
    public const string Assign = "content.assign";
    public const string Transfer = "content.transfer";
    public const string Return = "content.return";
    public const string Review = "content.review";
    public const string Publish = "content.publish";
    /// <summary>Presses and categories.</summary>
    public const string Manage = "content.manage";

    public static IReadOnlyList<PermissionDefinition> All { get; } =
    [
        new(Author, "Write articles in a press or category (standing)."),
        new(Editor, "Standing editor of a category: may publish own or self-reviewed articles."),
        new(Accept, "Accept submissions into the shift's queue (shift Manager)."),
        new(Assign, "Assign queued articles to an editor on shift (shift Manager)."),
        new(Transfer, "Hand unfinished review work to the next shift (shift Manager)."),
        new(Return, "Send an article back to its author (shift Manager, Desk)."),
        new(Review, "Edit and approve articles assigned to you (shift Editor)."),
        new(Publish, "Schedule and publish approved articles (shift Desk)."),
        new(Manage, "Manage presses and categories.")
    ];
}

/// <summary>Module settings (section <c>Content</c>).</summary>
public sealed class ContentOptions
{
    /// <summary>How long the owner may keep editing after submitting (until accepted or assigned). Default 24 hours.</summary>
    public TimeSpan OwnerEditWindow { get; set; } = TimeSpan.FromHours(24);
}

/// <summary>The caller lacks the right for this operation on this resource (endpoints map it to 403).</summary>
public sealed class ContentAccessDeniedException(string message) : Exception(message);

/// <summary>The resource does not exist, or the caller may not see it (endpoints map it to 404).</summary>
public sealed class ContentNotFoundException(string message) : Exception(message);

/// <summary>The caller's version is not the current one (endpoints map it to 409).</summary>
public sealed class ContentVersionConflictException(string message) : Exception(message);
