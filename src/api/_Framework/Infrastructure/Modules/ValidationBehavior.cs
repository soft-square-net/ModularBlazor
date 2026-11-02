using FluentValidation;
using MediatR;

namespace soft.square.net.ModularBlazor.Infrastructure.Modules;

/// <summary>Runs every FluentValidation validator for a request before its handler; throws ValidationException on failure.</summary>
public sealed class ValidationBehavior<TRequest, TResponse>(IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var validatorList = validators.ToList();
        if (validatorList.Count > 0)
        {
            var context = new ValidationContext<TRequest>(request);
            var results = await Task.WhenAll(validatorList.Select(v => v.ValidateAsync(context, cancellationToken)));
            var failures = results.SelectMany(r => r.Errors).Where(f => f is not null).ToList();
            if (failures.Count > 0)
                throw new ValidationException(failures);
        }

        return await next();
    }
}
