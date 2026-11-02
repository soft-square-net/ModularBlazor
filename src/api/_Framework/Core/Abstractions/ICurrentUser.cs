namespace soft.square.net.ModularBlazor.Core.Abstractions;

/// <summary>The caller of the current request. Used for audit fields.</summary>
public interface ICurrentUser
{
    string? UserId { get; }
    string? UserName { get; }
}
