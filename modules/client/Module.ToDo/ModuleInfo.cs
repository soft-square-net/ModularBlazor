using soft.square.net.ModularBlazor.Abstractions;

// Default settings of this module: read by Module Management when the file is uploaded.
[assembly: ClientModule(Name = "To-do", Layout = "default", RoutePrefixes = new[] { "todo" }, Styles = new[] { "todo.css" }, NavTitle = "To-do", NavHref = "todo", NavOrder = 30)]
