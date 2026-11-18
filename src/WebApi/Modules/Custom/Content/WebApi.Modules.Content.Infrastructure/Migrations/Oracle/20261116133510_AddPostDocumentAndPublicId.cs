using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Modules.Content.Infrastructure.Migrations.Oracle
{
    /// <inheritdoc />
    public partial class AddPostDocumentAndPublicId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DocumentJson",
                table: "content_articles",
                type: "NCLOB",
                nullable: false,
                defaultValue: "{}");

            // Oracle stores '' as NULL, so a NOT NULL column defaulting to '' cannot be added to a table with rows. Existing
            // rows get the permalink they already exposed (Post.StablePublicId = "legacy-{Id}") before the unique index.
            migrationBuilder.AddColumn<string>(
                name: "PublicId",
                table: "content_articles",
                type: "NVARCHAR2(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.Sql("UPDATE \"content_articles\" SET \"PublicId\" = 'legacy-' || \"Id\" WHERE \"PublicId\" IS NULL");

            migrationBuilder.AlterColumn<string>(
                name: "PublicId",
                table: "content_articles",
                type: "NVARCHAR2(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "NVARCHAR2(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublishedDocumentJson",
                table: "content_articles",
                type: "NCLOB",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SchemaId",
                table: "content_articles",
                type: "NVARCHAR2(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "legacy.basic");

            migrationBuilder.AddColumn<int>(
                name: "SchemaVersion",
                table: "content_articles",
                type: "NUMBER(10)",
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
