using soft.square.net.ModularBlazor.Abstractions;

// Default settings of this module: read by Module Management when the file is uploaded.
// css/main.min.css (MudTail tokens + layout shell) is built by node-app; js/module.js runs without being listed.
[assembly: ClientModule(Name = "Default layout", LoadOnStartup = true, Hidden = true, RequiresAuth = false,
    Styles = new[] { "css/main.min.css" })]
