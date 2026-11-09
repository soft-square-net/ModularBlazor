using soft.square.net.ModularBlazor.Abstractions;

// Default settings of this module: read by Module Management when the file is uploaded.
[assembly: ClientModule(Name = "Admin layout", Hidden = true, AvailableToRoles = new[] { "admin" })]
