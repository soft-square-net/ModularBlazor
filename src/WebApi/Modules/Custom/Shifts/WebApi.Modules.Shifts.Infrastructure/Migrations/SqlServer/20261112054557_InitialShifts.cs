using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace soft.square.net.WebApi.Modules.Shifts.Infrastructure.Migrations.SqlServer
{
    /// <inheritdoc />
    public partial class InitialShifts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "shifts");

            migrationBuilder.CreateTable(
                name: "sections",
                schema: "shifts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AutoAssignDelayMinutes = table.Column<int>(type: "int", nullable: true),
                    CheckoutGraceMinutes = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sections", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "shifts",
                schema: "shifts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SectionId = table.Column<int>(type: "int", nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EndsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Published = table.Column<bool>(type: "bit", nullable: false),
                    CheckedOutAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CheckedOutBy = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_shifts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "section_categories",
                schema: "shifts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CategoryId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SectionId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_section_categories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_section_categories_sections_SectionId",
                        column: x => x.SectionId,
                        principalSchema: "shifts",
                        principalTable: "sections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "shift_members",
                schema: "shifts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Role = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    CheckedOutAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ShiftId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_shift_members", x => x.Id);
                    table.ForeignKey(
                        name: "FK_shift_members_shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalSchema: "shifts",
                        principalTable: "shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_section_categories_SectionId",
                schema: "shifts",
                table: "section_categories",
                column: "SectionId");

            migrationBuilder.CreateIndex(
                name: "IX_sections_TenantId",
                schema: "shifts",
                table: "sections",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_shift_members_ShiftId",
                schema: "shifts",
                table: "shift_members",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_shift_members_UserId",
                schema: "shifts",
                table: "shift_members",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_shifts_SectionId_StartsAt",
                schema: "shifts",
                table: "shifts",
                columns: new[] { "SectionId", "StartsAt" });

            migrationBuilder.CreateIndex(
                name: "IX_shifts_TenantId",
                schema: "shifts",
                table: "shifts",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "section_categories",
                schema: "shifts");

            migrationBuilder.DropTable(
                name: "shift_members",
                schema: "shifts");

            migrationBuilder.DropTable(
                name: "sections",
                schema: "shifts");

            migrationBuilder.DropTable(
                name: "shifts",
                schema: "shifts");
        }
    }
}
