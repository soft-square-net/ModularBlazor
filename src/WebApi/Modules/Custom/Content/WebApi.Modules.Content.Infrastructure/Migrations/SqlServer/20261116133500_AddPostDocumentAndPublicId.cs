using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Modules.Content.Infrastructure.Migrations.SqlServer
{
    /// <inheritdoc />
    public partial class AddPostDocumentAndPublicId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DocumentJson",
                schema: "content",
                table: "articles",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "{}");

            // Existing rows get the permalink they already exposed (Post.StablePublicId = "legacy-{Id}"), so the unique
            // index below can be created and old links keep working.
            migrationBuilder.AddColumn<string>(
                name: "PublicId",
                schema: "content",
                table: "articles",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.Sql("UPDATE [content].[articles] SET [PublicId] = CONCAT(N'legacy-', [Id]) WHERE [PublicId] IS NULL");

            migrationBuilder.AlterColumn<string>(
                name: "PublicId",
                schema: "content",
                table: "articles",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublishedDocumentJson",
                schema: "content",
                table: "articles",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SchemaId",
                schema: "content",
                table: "articles",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "legacy.basic");

            migrationBuilder.AddColumn<int>(
                name: "SchemaVersion",
                schema: "content",
                table: "articles",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "IX_articles_PublicId",
                schema: "content",
                table: "articles",
                column: "PublicId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_articles_PublicId",
                schema: "content",
                table: "articles");

            migrationBuilder.DropColumn(
                name: "DocumentJson",
                schema: "content",
                table: "articles");

            migrationBuilder.DropColumn(
                name: "PublicId",
                schema: "content",
                table: "articles");

            migrationBuilder.DropColumn(
                name: "PublishedDocumentJson",
                schema: "content",
                table: "articles");

            migrationBuilder.DropColumn(
                name: "SchemaId",
                schema: "content",
                table: "articles");

            migrationBuilder.DropColumn(
                name: "SchemaVersion",
                schema: "content",
                table: "articles");
        }
    }
}
