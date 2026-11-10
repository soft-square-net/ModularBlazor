using MediatR;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Application.TodoItems;

namespace soft.square.net.ModularBlazor.Host.Modules.Todo.Infrastructure.Endpoints;

/// <summary>To-do items of the current tenant: /api/v1/todos (any signed-in user, JWT or API key).</summary>
public sealed class TodoEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/todos").WithTags("Todos").RequireAuthorization();

        group.MapGet("/", async ([AsParameters] PaginationFilter filter, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SearchTodoItemsQuery(filter), ct)))
            .WithName("SearchTodoItems")
            .WithSummary("Page through to-do items (keyword, filters, orderBy, pageNumber, pageSize)")
            .Produces<PagedResponse<TodoItemDto>>();

        group.MapGet("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new GetTodoItemQuery(id), ct)))
            .WithName("GetTodoItem")
            .WithSummary("Get a to-do item")
            .Produces<TodoItemDto>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("/", async (CreateTodoItemCommand command, ISender sender, CancellationToken ct) =>
            {
                var item = await sender.Send(command, ct);
                return Results.Created($"/api/v1/todos/{item.Id}", item);
            })
            .WithName("CreateTodoItem")
            .WithSummary("Add a to-do item")
            .Produces<TodoItemDto>(StatusCodes.Status201Created)
            .ProducesValidationProblem();

        group.MapPut("/{id:guid}", async (Guid id, UpdateTodoItemRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new UpdateTodoItemCommand(id, request.Title, request.Notes), ct)))
            .WithName("UpdateTodoItem")
            .WithSummary("Change a to-do item's title and notes")
            .Produces<TodoItemDto>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/{id:guid}/completed", async (Guid id, SetTodoItemCompletedRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SetTodoItemCompletedCommand(id, request.IsCompleted), ct)))
            .WithName("SetTodoItemCompleted")
            .WithSummary("Tick off or reopen a to-do item")
            .Produces<TodoItemDto>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapDelete("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new DeleteTodoItemCommand(id), ct);
                return Results.NoContent();
            })
            .WithName("DeleteTodoItem")
            .WithSummary("Delete a to-do item (soft delete)")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound);
    }
}
