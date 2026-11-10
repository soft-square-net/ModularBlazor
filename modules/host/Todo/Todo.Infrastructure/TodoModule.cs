using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Application.TodoItems;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Domain;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Infrastructure.Modules;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Todo.Infrastructure;

/// <summary>To-do lists per tenant: /api/v1/todos (used by the Module.ToDo client module).</summary>
public sealed class TodoModule : IHostModule
{
    public string Name => SchemaNames.Todo;

    public Assembly ApplicationAssembly => typeof(CreateTodoItemCommand).Assembly;

    public void AddServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<TodoDbContext>(Name);
        services.AddModuleRepository<TodoDbContext, TodoItem>();
        services.AddScoped<IDbInitializer, TodoDbInitializer>();
    }
}
