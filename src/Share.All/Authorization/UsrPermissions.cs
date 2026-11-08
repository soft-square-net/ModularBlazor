using System.Collections.ObjectModel;
using System.Security.AccessControl;

namespace soft.square.net.Share.All.Authorization;

public class UsrPermissions
{
    private static UsrPermissions _instance;
    private UsrPermissions()
    {
            
    }
    private static readonly List<UsrPermission> AllPermissions =
    [     
        //tenants
        new("View Tenants", UsrActions.View, UsrResources.Tenants, IsRoot: true),
        new("Create Tenants", UsrActions.Create, UsrResources.Tenants, IsRoot: true),
        new("Update Tenants", UsrActions.Update, UsrResources.Tenants, IsRoot: true),
        new("Upgrade Tenant Subscription", UsrActions.UpgradeSubscription, UsrResources.Tenants, IsRoot: true),

        //identity
        new("View Users", UsrActions.View, UsrResources.Users),
        new("Search Users", UsrActions.Search, UsrResources.Users),
        new("Create Users", UsrActions.Create, UsrResources.Users),
        new("Update Users", UsrActions.Update, UsrResources.Users),
        new("Delete Users", UsrActions.Delete, UsrResources.Users),
        new("Export Users", UsrActions.Export, UsrResources.Users),
        new("View UserRoles", UsrActions.View, UsrResources.UserRoles),
        new("Update UserRoles", UsrActions.Update, UsrResources.UserRoles),
        new("View Roles", UsrActions.View, UsrResources.Roles),
        new("Create Roles", UsrActions.Create, UsrResources.Roles),
        new("Update Roles", UsrActions.Update, UsrResources.Roles),
        new("Delete Roles", UsrActions.Delete, UsrResources.Roles),
        new("View RoleClaims", UsrActions.View, UsrResources.RoleClaims),
        new("Update RoleClaims", UsrActions.Update, UsrResources.RoleClaims),
        
        //products
        new("View Products", UsrActions.View, UsrResources.Products, IsBasic: true),
        new("Search Products", UsrActions.Search, UsrResources.Products, IsBasic: true),
        new("Create Products", UsrActions.Create, UsrResources.Products),
        new("Update Products", UsrActions.Update, UsrResources.Products),
        new("Delete Products", UsrActions.Delete, UsrResources.Products),
        new("Export Products", UsrActions.Export, UsrResources.Products),

        //brands
        new("View Brands", UsrActions.View, UsrResources.Brands, IsBasic: true),
        new("Search Brands", UsrActions.Search, UsrResources.Brands, IsBasic: true),
        new("Create Brands", UsrActions.Create, UsrResources.Brands),
        new("Update Brands", UsrActions.Update, UsrResources.Brands),
        new("Delete Brands", UsrActions.Delete, UsrResources.Brands),
        new("Export Brands", UsrActions.Export, UsrResources.Brands),

        //todos
        new("View Todos", UsrActions.View, UsrResources.Todos, IsBasic: true),
        new("Search Todos", UsrActions.Search, UsrResources.Todos, IsBasic: true),
        new("Create Todos", UsrActions.Create, UsrResources.Todos),
        new("Update Todos", UsrActions.Update, UsrResources.Todos),
        new("Delete Todos", UsrActions.Delete, UsrResources.Todos),
        new("Export Todos", UsrActions.Export, UsrResources.Todos),

         new("View Hangfire", UsrActions.View, UsrResources.Hangfire),
         new("View Dashboard", UsrActions.View, UsrResources.Dashboard),

        //audit
        new("View Audit Trails", UsrActions.View, UsrResources.AuditTrails),
        
        //storage accounts
        new("View storage accounts", UsrActions.View, UsrResources.StorageAccounts),
        new("Search storage accounts", UsrActions.Search, UsrResources.StorageAccounts),
        new("Create storage accounts", UsrActions.Create, UsrResources.StorageAccounts),
        new("Update storage accounts", UsrActions.Update, UsrResources.StorageAccounts),
        new("Delete storage accounts", UsrActions.Delete, UsrResources.StorageAccounts),
        new("Export storage accounts", UsrActions.Export, UsrResources.StorageAccounts),

        //AccessRules
         new("View Access Rules", UsrActions.View, UsrResources.AccessRules),
         new("Search Access Rules", UsrActions.Search, UsrResources.AccessRules),
         new("Create Access Rules", UsrActions.Create, UsrResources.AccessRules),
         new("Update Access Rules", UsrActions.Update, UsrResources.AccessRules),
         new("Delete Access Rules", UsrActions.Delete, UsrResources.AccessRules),
         new("Export Access Rules", UsrActions.Export, UsrResources.AccessRules),

                //Buckets
        new("View Buckets", UsrActions.View, UsrResources.Buckets, IsBasic: true),
        new("Search Buckets", UsrActions.Search, UsrResources.Buckets, IsBasic: true),
        new("Create Buckets", UsrActions.Create, UsrResources.Buckets),
        new("Update Buckets", UsrActions.Update, UsrResources.Buckets),
        new("Delete Buckets", UsrActions.Delete, UsrResources.Buckets),
        new("Export Buckets", UsrActions.Export, UsrResources.Buckets),

        //Files
        new("View Files", UsrActions.View, UsrResources.Files, IsBasic: true),
        new("Search Files", UsrActions.Search, UsrResources.Files, IsBasic:true),
        new("Create Files", UsrActions.Create, UsrResources.Files),
        new("Update Files", UsrActions.Update, UsrResources.Files),
        new("Delete Files", UsrActions.Delete, UsrResources.Files),
        new("Export Files", UsrActions.Export, UsrResources.Files),

        //Folders
        new("View Folders", UsrActions.View, UsrResources.Folders, IsBasic: true),
        new("Search Folders", UsrActions.Search, UsrResources.Folders, IsBasic: true),
        new("Create Folders", UsrActions.Create, UsrResources.Folders),
        new("Update Folders", UsrActions.Update, UsrResources.Folders),
        new("Delete Folders", UsrActions.Delete, UsrResources.Folders),
        new("Export Folders", UsrActions.Export, UsrResources.Folders),

    ];

    public static UsrPermissions Instance {
        get
        {
            return _instance ??= new UsrPermissions();
        }
    }

    public void LoadPermisions(UsrPermission[] permissions)
    {
        foreach (var permission in permissions)
        {
            if (!AllPermissions.Any(p => p.Name == permission.Name))
            {
                AllPermissions.Add(permission);
            }
        }
        // AllPermissions.AddRange(permissions);
    }
    public IReadOnlyList<UsrPermission> All { get; } = new ReadOnlyCollection<UsrPermission>(AllPermissions);
    public IReadOnlyList<UsrPermission> Root { get; } = new ReadOnlyCollection<UsrPermission>(AllPermissions.Where(p => p.IsRoot).ToArray());
    public IReadOnlyList<UsrPermission> Admin { get; } = new ReadOnlyCollection<UsrPermission>(AllPermissions.Where(p => !p.IsRoot).ToArray());
    public IReadOnlyList<UsrPermission> Basic { get; } = new ReadOnlyCollection<UsrPermission>(AllPermissions.Where(p => p.IsBasic).ToArray());
}

public record UsrPermission(string Description, string Action, string Resource, bool IsBasic = false, bool IsRoot = false)
{
    public string Name => NameFor(Action, Resource);
    public static string NameFor(string action, string resource)
    {
        return $"Permissions.{resource}.{action}";
    }
}


