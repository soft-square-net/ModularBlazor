using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Data.TenantStore.Migrations.Oracle
{
    /// <inheritdoc />
    public partial class AddTenantSubscriptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "platform_tenant_subscriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "RAW(16)", nullable: false),
                    TenantId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: false),
                    EndsAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: false),
                    Plan = table.Column<string>(type: "NVARCHAR2(100)", maxLength: 100, nullable: true),
                    Notes = table.Column<string>(type: "NVARCHAR2(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: false),
                    CreatedBy = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: true),
                    CancelledAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: true),
                    CancelledBy = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: true),
                    CancelReason = table.Column<string>(type: "NVARCHAR2(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_platform_tenant_subscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_platform_tenant_subscriptions_platform_tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "platform_tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_platform_tenant_subscriptions_EndsAt",
                table: "platform_tenant_subscriptions",
                column: "EndsAt");

            migrationBuilder.CreateIndex(
                name: "IX_platform_tenant_subscriptions_TenantId_StartsAt",
                table: "platform_tenant_subscriptions",
                columns: new[] { "TenantId", "StartsAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "platform_tenant_subscriptions");
        }
    }
}
