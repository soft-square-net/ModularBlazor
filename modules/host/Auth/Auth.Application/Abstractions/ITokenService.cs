namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Abstractions;

/// <summary>Issues the access token for a role. Implemented in Infrastructure.</summary>
public interface ITokenService
{
    string Issue(string role);
}
