using FluentValidation;
using MediatR;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Abstractions;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Commands.Login;

public sealed record LoginCommand(string UserName, string Password) : IRequest<LoginResult>;

public sealed record LoginResult(string UserName, string Role, string Token);

public sealed class LoginCommandValidator : AbstractValidator<LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(c => c.UserName).NotEmpty().MaximumLength(100);
        RuleFor(c => c.Password).NotEmpty();
    }
}

/// <summary>
/// DEMO sign-in: the password is not checked. An unknown user name is registered on first sign-in
/// (role "admin" for the user name "admin", otherwise "user"). Replace with real credential checks.
/// </summary>
public sealed class LoginCommandHandler(IRepository<User> users, ITokenService tokens, TimeProvider clock)
    : IRequestHandler<LoginCommand, LoginResult>
{
    public async Task<LoginResult> Handle(LoginCommand command, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var user = await users.FirstOrDefaultAsync(new UserByNameSpec(command.UserName), cancellationToken);

        if (user is null)
        {
            user = User.Register(command.UserName, User.RoleFor(command.UserName));
            await users.AddAsync(user, cancellationToken);
        }

        user.RecordLogin(now);
        await users.SaveChangesAsync(cancellationToken);

        return new LoginResult(user.UserName, user.Role, tokens.Issue(user.Role));
    }
}
