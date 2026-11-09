using soft.square.net.Share.All;

namespace Module.Admin;

/// <summary>The settings of a client module as text boxes (lists are comma separated, host modules one per line).</summary>
public sealed class ModuleSettingsModel
{
    public string? Id { get; set; }
    public string? Name { get; set; }
    public bool Enabled { get; set; } = true;
    public bool LoadOnStartup { get; set; }
    public bool RequiresAuth { get; set; } = true;
    public bool Hidden { get; set; }
    public string? RoutePrefixes { get; set; }
    public string? Layout { get; set; }
    public string? RequiredRole { get; set; }
    public string? AvailableToRoles { get; set; }
    public string? Dependencies { get; set; }
    public string? HostDependencies { get; set; }
    public string? Styles { get; set; }
    public string? Scripts { get; set; }
    public string? NavTitle { get; set; }
    public string? NavHref { get; set; }
    public int NavOrder { get; set; } = 100;

    public static ModuleSettingsModel From(ModuleRegistrationRequest r)
    {
        var nav = r.Nav.FirstOrDefault();
        return new ModuleSettingsModel
        {
            Id = r.Id, Name = r.Name, Enabled = r.Enabled, LoadOnStartup = r.LoadOnStartup, RequiresAuth = r.RequiresAuth, Hidden = r.Hidden,
            RoutePrefixes = string.Join(", ", r.RoutePrefixes), Layout = r.Layout, RequiredRole = r.RequiredRole,
            AvailableToRoles = string.Join(", ", r.AvailableToRoles), Dependencies = string.Join(", ", r.Dependencies),
            HostDependencies = string.Join("\n", r.HostDependencies.Select(d =>
                $"{d.Package}{(string.IsNullOrWhiteSpace(d.Version) ? "" : "@" + d.Version)}{(string.IsNullOrWhiteSpace(d.SourceUrl) ? "" : "|" + d.SourceUrl)}")),
            Styles = string.Join(", ", r.Styles), Scripts = string.Join(", ", r.Scripts),
            NavTitle = nav?.Title, NavHref = nav?.Href, NavOrder = nav?.Order ?? 100
        };
    }

    public static ModuleSettingsModel From(ModuleRegistrationDto m)
    {
        var model = From(new ModuleRegistrationRequest
        {
            Id = m.Id, Name = m.Name, Enabled = m.Enabled, LoadOnStartup = m.LoadOnStartup, RequiresAuth = m.RequiresAuth, Hidden = m.Hidden,
            RoutePrefixes = m.RoutePrefixes, Layout = m.Layout, RequiredRole = m.RequiredRole, AvailableToRoles = m.AvailableToRoles,
            Dependencies = m.Dependencies, Styles = m.Styles, Scripts = m.Scripts, Nav = m.Nav
        });
        model.HostDependencies = string.Join("\n", m.HostDependencies);
        return model;
    }

    public ModuleRegistrationRequest ToRequest() => new()
    {
        Id = Id, Name = Name, Enabled = Enabled, LoadOnStartup = LoadOnStartup, RequiresAuth = RequiresAuth, Hidden = Hidden,
        RequiredRole = RequiredRole, Layout = Layout,
        AvailableToRoles = Split(AvailableToRoles), RoutePrefixes = Split(RoutePrefixes), Dependencies = Split(Dependencies),
        Styles = Split(Styles), Scripts = Split(Scripts),
        HostDependencies = ParseHostDependencies(HostDependencies),
        Nav = string.IsNullOrWhiteSpace(NavTitle) ? [] : [new ModuleNavItem(NavTitle.Trim(), (NavHref ?? "").Trim(), NavOrder)]
    };

    // "Package@Version" or "Package@Version|https://source", one per line.
    public static HostDependencyRequest[] ParseHostDependencies(string? text)
        => (text ?? "").Split(['\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(line =>
            {
                var parts = line.Split('|', 2, StringSplitOptions.TrimEntries);
                var id = parts[0].Split('@', 2, StringSplitOptions.TrimEntries);
                return new HostDependencyRequest
                {
                    Package = id[0],
                    Version = id.Length > 1 && id[1].Length > 0 ? id[1] : null,
                    SourceUrl = parts.Length > 1 && parts[1].Length > 0 ? parts[1] : null
                };
            }).ToArray();

    private static string[] Split(string? csv)
        => (csv ?? "").Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
