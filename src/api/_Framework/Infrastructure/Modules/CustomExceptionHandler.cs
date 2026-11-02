using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using soft.square.net.ModularBlazor.Core.Exceptions;

namespace soft.square.net.ModularBlazor.Infrastructure.Modules;

/// <summary>Turns a CustomException (not found, conflict, ...) into a problem response with its status.</summary>
internal sealed class CustomExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is not CustomException custom)
            return false;

        await Results.Problem(custom.Message, statusCode: (int)custom.StatusCode).ExecuteAsync(httpContext);
        return true;
    }
}
