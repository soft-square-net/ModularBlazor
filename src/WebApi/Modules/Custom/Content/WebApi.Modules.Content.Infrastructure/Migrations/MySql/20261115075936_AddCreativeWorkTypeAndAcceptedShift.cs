using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Modules.Content.Infrastructure.Migrations.MySql
{
    /// <inheritdoc />
    public partial class AddCreativeWorkTypeAndAcceptedShift : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "AcceptedAt",
                table: "content_articles",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AcceptedShiftId",
                table: "content_articles",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "content_articles",
                type: "varchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Article");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AcceptedAt",
                table: "content_articles");

            migrationBuilder.DropColumn(
                name: "AcceptedShiftId",
                table: "content_articles");

            migrationBuilder.DropColumn(
                name: "Type",
                table: "content_articles");
        }
    }
}
