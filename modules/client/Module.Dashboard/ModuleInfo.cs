using soft.square.net.ModularBlazor.Abstractions;

// Default settings of this module: read by Module Management when the file is uploaded.
[assembly: ClientModule(Name = "Dashboard", Layout = "default", RoutePrefixes = new[] { "dashboard" }, NavTitle = "Dashboard", NavHref = "dashboard", NavOrder = 10)]
