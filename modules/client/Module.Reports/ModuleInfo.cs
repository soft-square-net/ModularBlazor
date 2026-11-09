using soft.square.net.ModularBlazor.Abstractions;

// Default settings of this module: read by Module Management when the file is uploaded.
[assembly: ClientModule(Name = "Reports", Layout = "default", RoutePrefixes = new[] { "reports" }, Styles = new[] { "reports.css" }, NavTitle = "Reports", NavHref = "reports", NavOrder = 20)]
