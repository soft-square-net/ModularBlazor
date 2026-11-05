using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Infrastructure.OpenApi;


namespace soft.square.net.ModularBlazor.Infrastructure;


public static class Extensions
{
  public static IServiceCollection AddCore(this IServiceCollection services, IConfiguration configuration)
  {
    services.ConfigureOpenApi(configuration);
    return services;
  }

  public static WebApplication UseCore(this WebApplication app)
  {
    app.UseOpenApi();
    return app;
  }
}
