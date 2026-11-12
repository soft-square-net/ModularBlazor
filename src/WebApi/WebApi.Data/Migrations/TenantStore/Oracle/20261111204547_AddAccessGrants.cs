using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Data.TenantStore.Migrations.Oracle
{
    /// <inheritdoc />
    public partial class AddAccessGrants : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "platform_access_grants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "RAW(16)", nullable: false),
                    TenantId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    UserId = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: false),
                    Permission = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: false),
                    Scope = table.Column<string>(type: "NVARCHAR2(200)", maxLength: 200, nullable: false),
                    ValidFrom = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: true),
                    ValidTo = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: true),
                    Source = table.Column<string>(type: "NVARCHAR2(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: false),
                    CreatedBy = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_platform_access_grants", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_platform_access_grants_TenantId_Source",
                table: "platform_access_grants",
                columns: new[] { "TenantId", "Source" });

            migrationBuilder.CreateIndex(
                name: "IX_platform_access_grants_TenantId_UserId",
                table: "platform_access_grants",
                columns: new[] { "TenantId", "UserId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "platform_access_grants");
        }
    }
}
