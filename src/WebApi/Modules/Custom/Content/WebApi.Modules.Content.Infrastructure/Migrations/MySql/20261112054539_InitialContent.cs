using System;
using Microsoft.EntityFrameworkCore.Migrations;
using MySql.EntityFrameworkCore.Metadata;

#nullable disable

namespace soft.square.net.WebApi.Modules.Content.Infrastructure.Migrations.MySql
{
    /// <inheritdoc />
    public partial class InitialContent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "content_articles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    TenantId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false),
                    PressId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false),
                    CategoryId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false),
                    Title = table.Column<string>(type: "varchar(300)", maxLength: 300, nullable: false),
                    Body = table.Column<string>(type: "longtext", nullable: false),
                    OwnerId = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: false),
                    State = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    AcceptedBy = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: true),
                    AssigneeId = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: true),
                    AssignedShiftId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: true),
                    ReviewerId = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: true),
                    ApprovedVersion = table.Column<int>(type: "int", nullable: true),
                    ScheduledFor = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    ScheduledBy = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: true),
                    ScheduledVersion = table.Column<int>(type: "int", nullable: true),
                    PublishedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    PublishedBy = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: true),
                    TransferredFromShift = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_content_articles", x => x.Id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "content_categories",
                columns: table => new
                {
                    Id = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false),
                    TenantId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false),
                    PressId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_content_categories", x => x.Id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "content_presses",
                columns: table => new
                {
                    Id = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false),
                    TenantId = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_content_presses", x => x.Id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "content_article_history",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    At = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    Actor = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: false),
                    Action = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false),
                    State = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: false),
                    Detail = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: true),
                    ArticleId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_content_article_history", x => x.Id);
                    table.ForeignKey(
                        name: "FK_content_article_history_content_articles_ArticleId",
                        column: x => x.ArticleId,
                        principalTable: "content_articles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_content_article_history_ArticleId",
                table: "content_article_history",
                column: "ArticleId");

            migrationBuilder.CreateIndex(
                name: "IX_content_articles_AssigneeId",
                table: "content_articles",
                column: "AssigneeId");

            migrationBuilder.CreateIndex(
                name: "IX_content_articles_OwnerId",
                table: "content_articles",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_content_articles_State_CategoryId",
                table: "content_articles",
                columns: new[] { "State", "CategoryId" });

            migrationBuilder.CreateIndex(
                name: "IX_content_articles_TenantId",
                table: "content_articles",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_content_categories_PressId",
                table: "content_categories",
                column: "PressId");

            migrationBuilder.CreateIndex(
                name: "IX_content_categories_TenantId",
                table: "content_categories",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_content_presses_TenantId",
                table: "content_presses",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "content_article_history");

            migrationBuilder.DropTable(
                name: "content_categories");

            migrationBuilder.DropTable(
                name: "content_presses");

            migrationBuilder.DropTable(
                name: "content_articles");
        }
    }
}
