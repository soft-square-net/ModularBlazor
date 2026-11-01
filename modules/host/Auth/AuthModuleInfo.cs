using System.Reflection;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth;

/// <summary>Lets the host find this module's assembly so Carter can register its slices.</summary>
public static class AuthModuleInfo
{
    public static Assembly Assembly => typeof(AuthModuleInfo).Assembly;
}
