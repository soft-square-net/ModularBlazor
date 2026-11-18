using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Modules.Content.Infrastructure.Migrations.MySql
{
    /// <inheritdoc />
    public partial class AddPostDocumentAndPublicId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // MySQL rejects a literal DEFAULT on a TEXT column: add it nullable, fill it, then require it. The application
            // always writes DocumentJson, so this engine needs no column default.
            migrationBuilder.AddColumn<string>(
                name: "DocumentJson",
                table: "content_articles",
                type: "longtext",
                nullable: true);

            migrationBuilder.Sql("UPDATE content_articles SET DocumentJson = '{}' WHERE DocumentJson IS NULL");

            migrationBuilder.AlterColumn<string>(
                name: "DocumentJson",
                table: "content_articles",
                type: "longtext",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "longtext",
                oldNullable: true);

            // Existing rows get the permalink they already exposed (Post.StablePublicId = "legacy-{Id}"), so the unique
            // index below can be created and old links keep working.
            migrationBuilder.AddColumn<string>(
                name: "PublicId",
                table: "content_articles",
                type: "varchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.Sql("UPDATE content_articles SET PublicId = CONCAT('legacy-', Id) WHERE PublicId IS NULL");

            migrationBuilder.AlterColumn<string>(
                name: "PublicId",
                table: "content_articles",
                type: "varchar(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublishedDocumentJson",
                table: "content_articles",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SchemaId",
                table: "content_articles",
                type: "varchar(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "legacy.basic");

            migrationBuilder.AddColumn<int>(
                name: "SchemaVersion",
                table: "content_articles",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "IX_content_articles_PublicId",
                table: "content_articles",
                column: "PublicId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_content_articles_PublicId",
                table: "content_articles");

            migrationBuilder.DropColumn(
                name: "DocumentJson",
                table: "content_articles");

            migrationBuilder.DropColumn(
                name: "PublicId",
                table: "content_articles");

            migrationBuilder.DropColumn(
                name: "PublishedDocumentJson",
                table: "content_articles");

            migrationBuilder.DropColumn(
                name: "SchemaId",
                table: "content_articles");

            migrationBuilder.DropColumn(
                name: "SchemaVersion",
                table: "content_articles");
        }
    }
}
