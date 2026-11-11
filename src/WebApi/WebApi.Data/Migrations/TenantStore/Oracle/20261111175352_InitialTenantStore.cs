using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Data.TenantStore.Migrations.Oracle
{
    /// <inheritdoc />
    public partial class InitialTenantStore : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "platform_tenants",
                columns: table => new
                {
                    Id = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "NVARCHAR2(200)", maxLength: 200, nullable: false),
                    Status = table.Column<string>(type: "NVARCHAR2(20)", maxLength: 20, nullable: false),
                    Hosts = table.Column<string>(type: "NVARCHAR2(2000)", maxLength: 2000, nullable: false),
                    DatabaseServer = table.Column<string>(type: "NVARCHAR2(100)", maxLength: 100, nullable: false),
                    DatabaseName = table.Column<string>(type: "NVARCHAR2(63)", maxLength: 63, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_platform_tenants", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "platform_tenants");
        }
    }
}
