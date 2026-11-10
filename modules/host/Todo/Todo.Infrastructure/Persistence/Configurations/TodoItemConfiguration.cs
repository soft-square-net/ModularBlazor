using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Todo.Infrastructure.Persistence.Configurations;

public sealed class TodoItemConfiguration : IEntityTypeConfiguration<TodoItem>
{
    public void Configure(EntityTypeBuilder<TodoItem> builder)
    {
        builder.ToTable("Items");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Title).HasMaxLength(TodoItem.TitleMaxLength).IsRequired();
        builder.Property(t => t.Notes).HasMaxLength(TodoItem.NotesMaxLength);
        builder.HasIndex(t => t.IsCompleted);
    }
}
