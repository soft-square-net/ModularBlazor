using soft.square.net.ModularBlazor.Abstractions;

// Default settings of this module: read by Module Management when the file is uploaded.
[assembly: ClientModule(Name = "Administration", RequiredRole = "admin", AvailableToRoles = new[] { "admin" }, Layout = "admin", RoutePrefixes = new[] { "admin" }, Dependencies = new[] { "Layouts.Admin" }, NavTitle = "Administration", NavHref = "admin", NavOrder = 90)]
