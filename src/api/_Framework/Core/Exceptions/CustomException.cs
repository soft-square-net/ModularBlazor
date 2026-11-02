using System.Net;

namespace soft.square.net.ModularBlazor.Core.Exceptions;

/// <summary>An expected failure with an HTTP status; the API turns it into a problem response.</summary>
public class CustomException(string message, HttpStatusCode statusCode = HttpStatusCode.BadRequest) : Exception(message)
{
    public HttpStatusCode StatusCode { get; } = statusCode;
}

public sealed class NotFoundException(string message) : CustomException(message, HttpStatusCode.NotFound);

public sealed class ConflictException(string message) : CustomException(message, HttpStatusCode.Conflict);
