using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Modules.Content.Infrastructure.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class AddCreativeWorkTypeAndAcceptedShift : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AcceptedAt",
                schema: "content",
                table: "articles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AcceptedShiftId",
                schema: "content",
                table: "articles",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Type",
                schema: "content",
                table: "articles",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Article");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AcceptedAt",
                schema: "content",
                table: "articles");

            migrationBuilder.DropColumn(
                name: "AcceptedShiftId",
                schema: "content",
                table: "articles");

            migrationBuilder.DropColumn(
                name: "Type",
                schema: "content",
                table: "articles");
        }
    }
}
