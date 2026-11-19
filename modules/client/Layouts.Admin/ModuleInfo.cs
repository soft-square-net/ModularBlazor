using soft.square.net.ModularBlazor.Abstractions;

// Default settings of this module: read by the WebApi's client-modules core module when it is seeded or uploaded.
// Only the administration pages use this layout, and they are for the platform-admin role.
[assembly: ClientModule(Name = "Admin layout", Hidden = true, AvailableToRoles = new[] { "platform-admin" },
    Styles = new[] { "css/module.css" })]
