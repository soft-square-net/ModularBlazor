using soft.square.net.Share.All;

namespace soft.square.net.Layouts.Default;

/// <summary>A top-level entry of the public site's mega-nav, with the links shown in its panel.</summary>
public sealed record NavSection(string Title, string Href, IReadOnlyList<NavLinkItem> Children);

public sealed record NavLinkItem(string Title, string Href);

/// <summary>
/// Turns the flat module menu into mega-nav sections by URL: an item whose href is "sports/football" goes into
/// the panel of the item whose href is "sports". Items without such a parent stay at the top level.
/// Order follows <see cref="ModuleNavItem.Order"/>, then the title.
/// </summary>
public static class PublicNavigation
{
  public static IReadOnlyList<NavSection> Build(IEnumerable<ModuleNavItem> items)
  {
    var ordered = items
      .Select(i => (Item: i, Href: Normalize(i.Href)))
      .OrderBy(x => x.Item.Order)
      .ThenBy(x => x.Item.Title, StringComparer.CurrentCultureIgnoreCase)
      .ToList();

    var topHrefs = ordered
      .Where(x => !x.Href.Contains('/'))
      .Select(x => x.Href)
      .ToHashSet(StringComparer.OrdinalIgnoreCase);

    var sections = new List<(string Title, string Href, List<NavLinkItem> Children)>();
    var byHref = new Dictionary<string, List<NavLinkItem>>(StringComparer.OrdinalIgnoreCase);

    foreach (var (item, href) in ordered)
    {
      var slash = href.IndexOf('/');
      var parent = slash > 0 ? href[..slash] : null;

      if (parent is not null && topHrefs.Contains(parent))
      {
        if (!byHref.TryGetValue(parent, out var children)) byHref[parent] = children = [];
        children.Add(new NavLinkItem(item.Title, href));
        continue;
      }

      if (byHref.ContainsKey(href)) continue; // the same section listed twice
      var list = new List<NavLinkItem>();
      byHref[href] = list;
      sections.Add((item.Title, href, list));
    }

    return sections.Select(s => new NavSection(s.Title, s.Href, s.Children)).ToList();
  }

  private static string Normalize(string? href) => (href ?? "").Trim().Trim('/');
}
