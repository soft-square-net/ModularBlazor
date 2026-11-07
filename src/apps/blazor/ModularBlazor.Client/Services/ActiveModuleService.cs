// Services/ActiveModuleService.cs
using System;
using System.Collections.Generic;

namespace soft.square.net.ModularBlazor.Client.Services;

public class ActiveModuleService
{
  public event Action OnChange;

  public string CurrentModuleId { get; private set; }
  public IReadOnlyDictionary<string, byte[]> ActiveAssets { get; private set; } = new Dictionary<string, byte[]>();
  public List<string> ActiveStyles { get; private set; } = new();
  public List<string> ActiveScripts { get; private set; } = new();

  public void SetActiveModule(string moduleId, IReadOnlyDictionary<string, byte[]> assets, string[] styles, string[] scripts)
  {
    CurrentModuleId = moduleId;
    ActiveAssets = assets;

    ActiveStyles.Clear();
    ActiveStyles.AddRange(styles);

    ActiveScripts.Clear();
    ActiveScripts.AddRange(scripts);

    NotifyStateChanged();
  }

  public void ClearActiveModule()
  {
    CurrentModuleId = null;
    ActiveAssets = new Dictionary<string, byte[]>();
    ActiveStyles.Clear();
    ActiveScripts.Clear();
    NotifyStateChanged();
  }

  private void NotifyStateChanged() => OnChange?.Invoke();
}
