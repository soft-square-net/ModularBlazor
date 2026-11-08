using System.Collections.ObjectModel;

namespace soft.square.net.Share.All.Authorization;

public static class UsrRoles
{
    public const string Admin = nameof(Admin);
    public const string Basic = nameof(Basic);
    public const string Designer = nameof(Designer);
    public const string WorkflowDesigner = nameof(WorkflowDesigner);

    public static IReadOnlyList<string> DefaultRoles { get; } = new ReadOnlyCollection<string>(new[]
    {
        Admin,
        Basic, 
        Designer, 
        WorkflowDesigner
    });

    public static bool IsDefault(string roleName) => DefaultRoles.Any(r => r == roleName);
}
