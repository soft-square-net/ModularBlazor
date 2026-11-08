//using System.Collections.ObjectModel;

//namespace soft.square.net.Share.All.Authorization;

//public static class UsrPermissions
//{
//    private static readonly UsrPermission[] AllPermissions =
//    [     
//        //tenants
//        new("View Tenants", UsrActions.View, UsrResources.Tenants, IsRoot: true),
//        new("Create Tenants", UsrActions.Create, UsrResources.Tenants, IsRoot: true),
//        new("Update Tenants", UsrActions.Update, UsrResources.Tenants, IsRoot: true),
//        new("Upgrade Tenant Subscription", UsrActions.UpgradeSubscription, UsrResources.Tenants, IsRoot: true),

//        //identity
//        new("View Users", UsrActions.View, UsrResources.Users),
//        new("Search Users", UsrActions.Search, UsrResources.Users),
//        new("Create Users", UsrActions.Create, UsrResources.Users),
//        new("Update Users", UsrActions.Update, UsrResources.Users),
//        new("Delete Users", UsrActions.Delete, UsrResources.Users),
//        new("Export Users", UsrActions.Export, UsrResources.Users),
//        new("View UserRoles", UsrActions.View, UsrResources.UserRoles),
//        new("Update UserRoles", UsrActions.Update, UsrResources.UserRoles),
//        new("View Roles", UsrActions.View, UsrResources.Roles),
//        new("Create Roles", UsrActions.Create, UsrResources.Roles),
//        new("Update Roles", UsrActions.Update, UsrResources.Roles),
//        new("Delete Roles", UsrActions.Delete, UsrResources.Roles),
//        new("View RoleClaims", UsrActions.View, UsrResources.RoleClaims),
//        new("Update RoleClaims", UsrActions.Update, UsrResources.RoleClaims),

//        //products
//        new("View Products", UsrActions.View, UsrResources.Products, IsBasic: true),
//        new("Search Products", UsrActions.Search, UsrResources.Products, IsBasic: true),
//        new("Create Products", UsrActions.Create, UsrResources.Products),
//        new("Update Products", UsrActions.Update, UsrResources.Products),
//        new("Delete Products", UsrActions.Delete, UsrResources.Products),
//        new("Export Products", UsrActions.Export, UsrResources.Products),

//        //brands
//        new("View Brands", UsrActions.View, UsrResources.Brands, IsBasic: true),
//        new("Search Brands", UsrActions.Search, UsrResources.Brands, IsBasic: true),
//        new("Create Brands", UsrActions.Create, UsrResources.Brands),
//        new("Update Brands", UsrActions.Update, UsrResources.Brands),
//        new("Delete Brands", UsrActions.Delete, UsrResources.Brands),
//        new("Export Brands", UsrActions.Export, UsrResources.Brands),

//        //todos
//        new("View Todos", UsrActions.View, UsrResources.Todos, IsBasic: true),
//        new("Search Todos", UsrActions.Search, UsrResources.Todos, IsBasic: true),
//        new("Create Todos", UsrActions.Create, UsrResources.Todos),
//        new("Update Todos", UsrActions.Update, UsrResources.Todos),
//        new("Delete Todos", UsrActions.Delete, UsrResources.Todos),
//        new("Export Todos", UsrActions.Export, UsrResources.Todos),

//         new("View Hangfire", UsrActions.View, UsrResources.Hangfire),
//         new("View Dashboard", UsrActions.View, UsrResources.Dashboard),

//        //audit
//        new("View Audit Trails", UsrActions.View, UsrResources.AuditTrails),

//    ];

//    public static IReadOnlyList<UsrPermission> All { get; } = new ReadOnlyCollection<UsrPermission>(AllPermissions);
//    public static IReadOnlyList<UsrPermission> Root { get; } = new ReadOnlyCollection<UsrPermission>(AllPermissions.Where(p => p.IsRoot).ToArray());
//    public static IReadOnlyList<UsrPermission> Admin { get; } = new ReadOnlyCollection<UsrPermission>(AllPermissions.Where(p => !p.IsRoot).ToArray());
//    public static IReadOnlyList<UsrPermission> Basic { get; } = new ReadOnlyCollection<UsrPermission>(AllPermissions.Where(p => p.IsBasic).ToArray());
//}

//public record UsrPermission2(string Description, string Action, string Resource, bool IsBasic = false, bool IsRoot = false)
//{
//    public string Name => NameFor(Action, Resource);
//    public static string NameFor(string action, string resource)
//    {
//        return $"Permissions.{resource}.{action}";
//    }
//}


