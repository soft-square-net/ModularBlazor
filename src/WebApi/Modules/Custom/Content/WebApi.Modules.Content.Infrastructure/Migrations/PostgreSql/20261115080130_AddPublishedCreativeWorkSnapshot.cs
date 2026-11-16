using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Modules.Content.Infrastructure.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class AddPublishedCreativeWorkSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PublishedBody",
                schema: "content",
                table: "articles",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublishedTitle",
                schema: "content",
                table: "articles",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.Sql("UPDATE content.articles SET \"PublishedTitle\" = \"Title\", \"PublishedBody\" = \"Body\" WHERE \"State\" = 'Published'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PublishedBody",
                schema: "content",
                table: "articles");

            migrationBuilder.DropColumn(
                name: "PublishedTitle",
                schema: "content",
                table: "articles");
        }
    }
}
