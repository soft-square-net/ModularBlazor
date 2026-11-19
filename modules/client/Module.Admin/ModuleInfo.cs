using soft.square.net.ModularBlazor.Abstractions;

// Default settings of this module: read by the WebApi's client-modules core module when it is seeded or uploaded.
// The access token carries platform roles only (a tenant admin has none), so the area is for platform-admin; the
// identity service's membership API itself also accepts tenant admins.
[assembly: ClientModule(Name = "Administration", RequiredRole = "platform-admin", AvailableToRoles = new[] { "platform-admin" },
    Layout = "admin", RoutePrefixes = new[] { "admin" }, Dependencies = new[] { "Layouts.Admin" }, Styles = new[] { "admin.css" },
    NavTitle = "Administration", NavHref = "admin", NavOrder = 90)]
