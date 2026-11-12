using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Modules.Content.Infrastructure.Migrations.SqlServer
{
    /// <inheritdoc />
    public partial class InitialContent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "content");

            migrationBuilder.CreateTable(
                name: "articles",
                schema: "content",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    PressId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CategoryId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Body = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OwnerId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    State = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    AcceptedBy = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    AssigneeId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    AssignedShiftId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ReviewerId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    ApprovedVersion = table.Column<int>(type: "int", nullable: true),
                    ScheduledFor = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ScheduledBy = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    ScheduledVersion = table.Column<int>(type: "int", nullable: true),
                    PublishedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    PublishedBy = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    TransferredFromShift = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_articles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "categories",
                schema: "content",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    TenantId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    PressId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_categories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "presses",
                schema: "content",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    TenantId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_presses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "article_history",
                schema: "content",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    At = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Actor = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Action = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    State = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Detail = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ArticleId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_article_history", x => x.Id);
                    table.ForeignKey(
                        name: "FK_article_history_articles_ArticleId",
                        column: x => x.ArticleId,
                        principalSchema: "content",
                        principalTable: "articles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_article_history_ArticleId",
                schema: "content",
                table: "article_history",
                column: "ArticleId");

            migrationBuilder.CreateIndex(
                name: "IX_articles_AssigneeId",
                schema: "content",
                table: "articles",
                column: "AssigneeId");

            migrationBuilder.CreateIndex(
                name: "IX_articles_OwnerId",
                schema: "content",
                table: "articles",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_articles_State_CategoryId",
                schema: "content",
                table: "articles",
                columns: new[] { "State", "CategoryId" });

            migrationBuilder.CreateIndex(
                name: "IX_articles_TenantId",
                schema: "content",
                table: "articles",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_categories_PressId",
                schema: "content",
                table: "categories",
                column: "PressId");

            migrationBuilder.CreateIndex(
                name: "IX_categories_TenantId",
                schema: "content",
                table: "categories",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_presses_TenantId",
                schema: "content",
                table: "presses",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "article_history",
                schema: "content");

            migrationBuilder.DropTable(
                name: "categories",
                schema: "content");

            migrationBuilder.DropTable(
                name: "presses",
                schema: "content");

            migrationBuilder.DropTable(
                name: "articles",
                schema: "content");
        }
    }
}
