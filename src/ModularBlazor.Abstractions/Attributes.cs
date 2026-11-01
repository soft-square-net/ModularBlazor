namespace soft.square.net.ModularBlazor.Abstractions;

/// <summary>
/// Put on a LayoutComponentBase in any module to register it under a key.
/// Usage in Razor: @attribute [LayoutKey("default")]
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
public sealed class LayoutKeyAttribute(string key) : Attribute
{
    public string Key { get; } = key;
}

/// <summary>
/// Put on a page to pick a registered layout by key, overriding the module's default layout.
/// Usage in Razor: @attribute [UseLayout("admin")]  (use "none" for no layout)
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
public sealed class UseLayoutAttribute(string key) : Attribute
{
    public string Key { get; } = key;
}
