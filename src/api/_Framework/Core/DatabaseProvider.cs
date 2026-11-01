namespace soft.square.net.ModularBlazor.Core;

/// <summary>Database engines a tenant (or the tenant store) can run on. One migrations project exists per value.</summary>
public enum DatabaseProvider
{
    SqlServer,
    PostgreSql,

    /// <summary>MySQL through Oracle's MySql.EntityFrameworkCore provider.</summary>
    MySql
}
