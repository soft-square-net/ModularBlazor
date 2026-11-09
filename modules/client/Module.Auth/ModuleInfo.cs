using soft.square.net.ModularBlazor.Abstractions;

// Default settings of this module: read by Module Management when the file is uploaded.
[assembly: ClientModule(Name = "Authentication (login page + auth layout)", LoadOnStartup = true, Hidden = true, RequiresAuth = false, Layout = "auth", RoutePrefixes = new[] { "login" })]
