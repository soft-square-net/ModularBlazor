namespace soft.square.net.ModularBlazor.Host.Modules.Todo.Application.TodoItems;

public sealed record TodoItemDto(Guid Id, string Title, string? Notes, bool IsCompleted, DateTime? CompletedOnUtc, DateTime CreatedOnUtc);

/// <summary>Body of PUT /api/v1/todos/{id}.</summary>
public sealed record UpdateTodoItemRequest(string Title, string? Notes);

/// <summary>Body of PUT /api/v1/todos/{id}/completed.</summary>
public sealed record SetTodoItemCompletedRequest(bool IsCompleted);
