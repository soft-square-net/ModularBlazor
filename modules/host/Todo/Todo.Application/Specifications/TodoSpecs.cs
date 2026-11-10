using Ardalis.Specification;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Application.TodoItems;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Todo.Application.Specifications;

public sealed class TodoItemByIdSpec : Specification<TodoItem>, ISingleResultSpecification<TodoItem>
{
    public TodoItemByIdSpec(Guid id) => Query.Where(t => t.Id == id);
}

/// <summary>One page of to-do items: keyword search, Filters (e.g. <c>IsCompleted|eq|false</c>) and OrderBy from the request.</summary>
public sealed class TodoItemsByPaginationFilterSpec : EntitiesByPaginationFilterSpec<TodoItem, TodoItemDto>
{
    /// <summary>The properties a client may search, filter and order by.</summary>
    public static readonly string[] Fields =
        [nameof(TodoItem.Title), nameof(TodoItem.Notes), nameof(TodoItem.IsCompleted), nameof(TodoItem.CompletedOnUtc), nameof(TodoItem.CreatedOnUtc)];

    public TodoItemsByPaginationFilterSpec(PaginationFilter filter) : base(filter)
        => Query.Select(t => new TodoItemDto(t.Id, t.Title, t.Notes, t.IsCompleted, t.CompletedOnUtc, t.CreatedOnUtc));
}
