namespace soft.square.net.ModularBlazor.Core.Abstractions;

/// <summary>The tenant of the current request ("root" when none was resolved).</summary>
public interface ICurrentTenant
{
    string Id { get; }
}
