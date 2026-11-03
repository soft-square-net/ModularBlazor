namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

/// <summary>
/// Database schema of each host module (the tables, and the migrations history table, live in it).
/// Also the module name used by AddModuleDbContext. MySQL has no schemas: there the module name is
/// prefixed to the table names instead (Auth_Users).
/// </summary>
public static class SchemaNames
{
    public const string Auth = "Auth";
    public const string Catalog = "Catalog";
    public const string Multitenancy = "Multitenancy";
    public const string ElsaHost = "ElsaHost";
}
