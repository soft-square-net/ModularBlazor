using System.Net;
using FluentValidation;
using MediatR;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Tokens;

/// <summary>Creates an access token and a refresh token for a user.</summary>
public sealed class TokenIssuer(
    UserAccessResolver access, ITokenService tokens, IRepository<RefreshToken> refreshTokens, TimeProvider clock)
{
    public async Task<TokenResult> IssueAsync(User user, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var (roles, permissions) = await access.ResolveAsync(user, cancellationToken);
        var accessToken = tokens.CreateAccessToken(user, roles, permissions);

        var refreshSecret = Hashing.NewSecret();
        var refreshExpires = now.AddDays(tokens.RefreshTokenDays);
        await refreshTokens.AddAsync(
            RefreshToken.Create(user.Id, Hashing.Sha256Hex(refreshSecret), now, refreshExpires), cancellationToken);

        return new TokenResult(accessToken.Token, accessToken.ExpiresUtc, refreshSecret, refreshExpires);
    }
}

// ---- sign in ----

/// <summary>Sign in with user name (or email) and password.</summary>
public sealed record LoginCommand(string UserName, string Password) : IRequest<TokenResult>;

public sealed class LoginCommandValidator : AbstractValidator<LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(c => c.UserName).NotEmpty().MaximumLength(256);
        RuleFor(c => c.Password).NotEmpty();
    }
}

public sealed class LoginCommandHandler(
    IRepository<User> users, IPasswordService passwords, TokenIssuer issuer, TimeProvider clock)
    : IRequestHandler<LoginCommand, TokenResult>
{
    public async Task<TokenResult> Handle(LoginCommand command, CancellationToken cancellationToken)
    {
        var user = await users.FirstOrDefaultAsync(new UserByLoginSpec(command.UserName), cancellationToken);
        if (user is null || !user.IsActive || !passwords.Verify(user.PasswordHash, command.Password))
            throw new CustomException("Invalid user name or password.", HttpStatusCode.Unauthorized);

        user.RecordLogin(clock.GetUtcNow().UtcDateTime);
        await users.SaveChangesAsync(cancellationToken);

        return await issuer.IssueAsync(user, cancellationToken);
    }
}

// ---- refresh ----

public sealed record RefreshTokenCommand(string RefreshToken) : IRequest<TokenResult>;

public sealed class RefreshTokenCommandValidator : AbstractValidator<RefreshTokenCommand>
{
    public RefreshTokenCommandValidator() => RuleFor(c => c.RefreshToken).NotEmpty();
}

/// <summary>Exchanges a refresh token for a new access token and a new refresh token (the old one is revoked).</summary>
public sealed class RefreshTokenCommandHandler(
    IRepository<RefreshToken> refreshTokens, IRepository<User> users, TokenIssuer issuer, TimeProvider clock)
    : IRequestHandler<RefreshTokenCommand, TokenResult>
{
    public async Task<TokenResult> Handle(RefreshTokenCommand command, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var existing = await refreshTokens.FirstOrDefaultAsync(
            new RefreshTokenByHashSpec(Hashing.Sha256Hex(command.RefreshToken)), cancellationToken);

        if (existing is null || !existing.IsActive(now))
            throw new CustomException("The refresh token is invalid or expired.", HttpStatusCode.Unauthorized);

        var user = await users.FirstOrDefaultAsync(new UserWithRolesSpec(existing.UserId), cancellationToken);
        if (user is null || !user.IsActive)
            throw new CustomException("The refresh token is invalid or expired.", HttpStatusCode.Unauthorized);

        var result = await issuer.IssueAsync(user, cancellationToken);
        existing.Revoke(now, Hashing.Sha256Hex(result.RefreshToken));
        await refreshTokens.SaveChangesAsync(cancellationToken);

        return result;
    }
}

// ---- sign out ----

public sealed record RevokeRefreshTokenCommand(string RefreshToken) : IRequest;

public sealed class RevokeRefreshTokenCommandHandler(IRepository<RefreshToken> refreshTokens, TimeProvider clock)
    : IRequestHandler<RevokeRefreshTokenCommand>
{
    public async Task Handle(RevokeRefreshTokenCommand command, CancellationToken cancellationToken)
    {
        var token = await refreshTokens.FirstOrDefaultAsync(
            new RefreshTokenByHashSpec(Hashing.Sha256Hex(command.RefreshToken)), cancellationToken);
        if (token is null) return;

        token.Revoke(clock.GetUtcNow().UtcDateTime);
        await refreshTokens.SaveChangesAsync(cancellationToken);
    }
}
