using Ardalis.Specification;
using FluentValidation;
using MediatR;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Core.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Application.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Todo.Application.TodoItems;

internal static class TodoItemMapping
{
    public static TodoItemDto ToDto(this TodoItem t) => new(t.Id, t.Title, t.Notes, t.IsCompleted, t.CompletedOnUtc, t.CreatedOnUtc);

    public static async Task<TodoItem> GetAsync(this IReadRepositoryBase<TodoItem> items, Guid id, CancellationToken ct)
        => await items.FirstOrDefaultAsync(new TodoItemByIdSpec(id), ct) ?? throw new NotFoundException($"To-do item '{id}' was not found.");
}

// ---- search
public sealed record SearchTodoItemsQuery(PaginationFilter Filter) : IRequest<PagedResponse<TodoItemDto>>;

public sealed class SearchTodoItemsQueryHandler(IReadRepository<TodoItem> items)
    : IRequestHandler<SearchTodoItemsQuery, PagedResponse<TodoItemDto>>
{
    public Task<PagedResponse<TodoItemDto>> Handle(SearchTodoItemsQuery q, CancellationToken cancellationToken)
    {
        var filter = q.Filter.RestrictTo(TodoItemsByPaginationFilterSpec.Fields);
        return items.PaginatedListAsync(new TodoItemsByPaginationFilterSpec(filter), filter, cancellationToken);
    }
}

// ---- get
public sealed record GetTodoItemQuery(Guid Id) : IRequest<TodoItemDto>;

public sealed class GetTodoItemQueryHandler(IReadRepository<TodoItem> items) : IRequestHandler<GetTodoItemQuery, TodoItemDto>
{
    public async Task<TodoItemDto> Handle(GetTodoItemQuery q, CancellationToken cancellationToken)
        => (await items.GetAsync(q.Id, cancellationToken)).ToDto();
}

// ---- create
public sealed record CreateTodoItemCommand(string Title, string? Notes = null) : IRequest<TodoItemDto>;

public sealed class CreateTodoItemCommandValidator : AbstractValidator<CreateTodoItemCommand>
{
    public CreateTodoItemCommandValidator()
    {
        RuleFor(c => c.Title).NotEmpty().MaximumLength(TodoItem.TitleMaxLength);
        RuleFor(c => c.Notes).MaximumLength(TodoItem.NotesMaxLength);
    }
}

public sealed class CreateTodoItemCommandHandler(IRepository<TodoItem> items) : IRequestHandler<CreateTodoItemCommand, TodoItemDto>
{
    public async Task<TodoItemDto> Handle(CreateTodoItemCommand c, CancellationToken cancellationToken)
    {
        var item = TodoItem.Create(c.Title, c.Notes);
        await items.AddAsync(item, cancellationToken);
        return item.ToDto();
    }
}

// ---- update
public sealed record UpdateTodoItemCommand(Guid Id, string Title, string? Notes) : IRequest<TodoItemDto>;

public sealed class UpdateTodoItemCommandValidator : AbstractValidator<UpdateTodoItemCommand>
{
    public UpdateTodoItemCommandValidator()
    {
        RuleFor(c => c.Title).NotEmpty().MaximumLength(TodoItem.TitleMaxLength);
        RuleFor(c => c.Notes).MaximumLength(TodoItem.NotesMaxLength);
    }
}

public sealed class UpdateTodoItemCommandHandler(IRepository<TodoItem> items) : IRequestHandler<UpdateTodoItemCommand, TodoItemDto>
{
    public async Task<TodoItemDto> Handle(UpdateTodoItemCommand c, CancellationToken cancellationToken)
    {
        var item = await items.GetAsync(c.Id, cancellationToken);
        item.Update(c.Title, c.Notes);
        await items.SaveChangesAsync(cancellationToken);
        return item.ToDto();
    }
}

// ---- complete / reopen
public sealed record SetTodoItemCompletedCommand(Guid Id, bool IsCompleted) : IRequest<TodoItemDto>;

public sealed class SetTodoItemCompletedCommandHandler(IRepository<TodoItem> items, TimeProvider clock)
    : IRequestHandler<SetTodoItemCompletedCommand, TodoItemDto>
{
    public async Task<TodoItemDto> Handle(SetTodoItemCompletedCommand c, CancellationToken cancellationToken)
    {
        var item = await items.GetAsync(c.Id, cancellationToken);
        item.SetCompleted(c.IsCompleted, clock.GetUtcNow().UtcDateTime);
        await items.SaveChangesAsync(cancellationToken);
        return item.ToDto();
    }
}

// ---- delete (soft delete, see AuditableAggregateRoot)
public sealed record DeleteTodoItemCommand(Guid Id) : IRequest;

public sealed class DeleteTodoItemCommandHandler(IRepository<TodoItem> items) : IRequestHandler<DeleteTodoItemCommand>
{
    public async Task Handle(DeleteTodoItemCommand c, CancellationToken cancellationToken)
    {
        var item = await items.GetAsync(c.Id, cancellationToken);
        await items.DeleteAsync(item, cancellationToken);
    }
}
