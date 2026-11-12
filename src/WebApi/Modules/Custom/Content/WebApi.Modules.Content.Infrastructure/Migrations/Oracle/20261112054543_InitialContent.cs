using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Modules.Content.Infrastructure.Migrations.Oracle
{
    /// <inheritdoc />
    public partial class InitialContent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "content_articles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "NUMBER(10)", nullable: false)
                        .Annotation("Oracle:Identity", "START WITH 1 INCREMENT BY 1"),
                    TenantId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    PressId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    CategoryId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    Title = table.Column<string>(type: "NVARCHAR2(300)", maxLength: 300, nullable: false),
                    Body = table.Column<string>(type: "NVARCHAR2(2000)", nullable: false),
                    OwnerId = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: false),
                    State = table.Column<string>(type: "NVARCHAR2(32)", maxLength: 32, nullable: false),
                    Version = table.Column<int>(type: "NUMBER(10)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: false),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: true),
                    AcceptedBy = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: true),
                    AssigneeId = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: true),
                    AssignedShiftId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: true),
                    ReviewerId = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: true),
                    ApprovedVersion = table.Column<int>(type: "NUMBER(10)", nullable: true),
                    ScheduledFor = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: true),
                    ScheduledBy = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: true),
                    ScheduledVersion = table.Column<int>(type: "NUMBER(10)", nullable: true),
                    PublishedAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: true),
                    PublishedBy = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: true),
                    TransferredFromShift = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_content_articles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "content_categories",
                columns: table => new
                {
                    Id = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    TenantId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    PressId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "NVARCHAR2(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_content_categories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "content_presses",
                columns: table => new
                {
                    Id = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    TenantId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "NVARCHAR2(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_content_presses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "content_article_history",
                columns: table => new
                {
                    Id = table.Column<int>(type: "NUMBER(10)", nullable: false)
                        .Annotation("Oracle:Identity", "START WITH 1 INCREMENT BY 1"),
                    At = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: false),
                    Actor = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: false),
                    Action = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    State = table.Column<string>(type: "NVARCHAR2(32)", maxLength: 32, nullable: false),
                    Detail = table.Column<string>(type: "NVARCHAR2(500)", maxLength: 500, nullable: true),
                    ArticleId = table.Column<int>(type: "NUMBER(10)", nullable: true)
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
                });

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
