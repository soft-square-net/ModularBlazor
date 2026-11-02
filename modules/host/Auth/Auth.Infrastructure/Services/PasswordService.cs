using Microsoft.AspNetCore.Identity;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Services;

/// <summary>ASP.NET Core's PasswordHasher (PBKDF2, salted, versioned format).</summary>
public sealed class PasswordService : IPasswordService
{
    private readonly PasswordHasher<object> _hasher = new();
    private static readonly object Subject = new();

    public string Hash(string password) => _hasher.HashPassword(Subject, password);

    public bool Verify(string passwordHash, string password)
        => _hasher.VerifyHashedPassword(Subject, passwordHash, password) != PasswordVerificationResult.Failed;
}
