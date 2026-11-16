using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Modules.Content.Infrastructure.Migrations.MySql
{
    /// <inheritdoc />
    public partial class AddPublishedCreativeWorkSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PublishedBody",
                table: "content_articles",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublishedTitle",
                table: "content_articles",
                type: "varchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.Sql("UPDATE content_articles SET PublishedTitle = Title, PublishedBody = Body WHERE State = 'Published'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PublishedBody",
                table: "content_articles");

            migrationBuilder.DropColumn(
                name: "PublishedTitle",
                table: "content_articles");
        }
    }
}
