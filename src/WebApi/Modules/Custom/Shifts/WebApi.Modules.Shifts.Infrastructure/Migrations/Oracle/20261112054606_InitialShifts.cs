using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Modules.Shifts.Infrastructure.Migrations.Oracle
{
    /// <inheritdoc />
    public partial class InitialShifts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "shifts_sections",
                columns: table => new
                {
                    Id = table.Column<int>(type: "NUMBER(10)", nullable: false)
                        .Annotation("Oracle:Identity", "START WITH 1 INCREMENT BY 1"),
                    TenantId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "NVARCHAR2(200)", maxLength: 200, nullable: false),
                    AutoAssignDelayMinutes = table.Column<int>(type: "NUMBER(10)", nullable: true),
                    CheckoutGraceMinutes = table.Column<int>(type: "NUMBER(10)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_shifts_sections", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "shifts_shifts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "NUMBER(10)", nullable: false)
                        .Annotation("Oracle:Identity", "START WITH 1 INCREMENT BY 1"),
                    TenantId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    SectionId = table.Column<int>(type: "NUMBER(10)", nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: false),
                    EndsAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: false),
                    Published = table.Column<bool>(type: "BOOLEAN", nullable: false),
                    CheckedOutAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: true),
                    CheckedOutBy = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_shifts_shifts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "shifts_section_categories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "NUMBER(10)", nullable: false)
                        .Annotation("Oracle:Identity", "START WITH 1 INCREMENT BY 1"),
                    CategoryId = table.Column<string>(type: "NVARCHAR2(64)", maxLength: 64, nullable: false),
                    SectionId = table.Column<int>(type: "NUMBER(10)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_shifts_section_categories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_shifts_section_categories_shifts_sections_SectionId",
                        column: x => x.SectionId,
                        principalTable: "shifts_sections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "shifts_shift_members",
                columns: table => new
                {
                    Id = table.Column<int>(type: "NUMBER(10)", nullable: false)
                        .Annotation("Oracle:Identity", "START WITH 1 INCREMENT BY 1"),
                    UserId = table.Column<string>(type: "NVARCHAR2(128)", maxLength: 128, nullable: false),
                    Role = table.Column<string>(type: "NVARCHAR2(16)", maxLength: 16, nullable: false),
                    CheckedOutAt = table.Column<DateTimeOffset>(type: "TIMESTAMP(7) WITH TIME ZONE", nullable: true),
                    ShiftId = table.Column<int>(type: "NUMBER(10)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_shifts_shift_members", x => x.Id);
                    table.ForeignKey(
                        name: "FK_shifts_shift_members_shifts_shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "shifts_shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_shifts_section_categories_SectionId",
                table: "shifts_section_categories",
                column: "SectionId");

            migrationBuilder.CreateIndex(
                name: "IX_shifts_sections_TenantId",
                table: "shifts_sections",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_shifts_shift_members_ShiftId",
                table: "shifts_shift_members",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_shifts_shift_members_UserId",
                table: "shifts_shift_members",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_shifts_shifts_SectionId_StartsAt",
                table: "shifts_shifts",
                columns: new[] { "SectionId", "StartsAt" });

            migrationBuilder.CreateIndex(
                name: "IX_shifts_shifts_TenantId",
                table: "shifts_shifts",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "shifts_section_categories");

            migrationBuilder.DropTable(
                name: "shifts_shift_members");

            migrationBuilder.DropTable(
                name: "shifts_sections");

            migrationBuilder.DropTable(
                name: "shifts_shifts");
        }
    }
}
