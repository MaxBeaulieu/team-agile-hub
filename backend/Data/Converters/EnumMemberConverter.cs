using System.Reflection;
using System.Runtime.Serialization;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Backend.Data.Converters;

/// <summary>
/// Converts an enum to/from the string declared on its <c>[EnumMember(Value = "...")]</c>
/// attribute, falling back to the C# member name if the attribute is absent.
///
/// Deliberately NOT <c>HasConversion&lt;string&gt;()</c>, which uses <c>Enum.ToString()</c>
/// (the C# member name, always PascalCase). 7 of this app's 11 model enums have an
/// <c>[EnumMember]</c> value that differs from the member name (e.g.
/// <c>TeamRole.Member</c> serialises as <c>"member"</c>) — a blanket
/// <c>HasConversion&lt;string&gt;()</c> would insert the wrong casing for those and
/// violate the matching Postgres CHECK constraint. See
/// docs/architecture/selfhost-migration.md §3.3.
///
/// Applied to every enum-typed property in one pass by
/// <see cref="AppDbContext.ApplyEnumMemberConversions"/> — no per-entity configuration
/// can forget it.
/// </summary>
public sealed class EnumMemberConverter<T> : ValueConverter<T, string> where T : struct, Enum
{
    public EnumMemberConverter()
        : base(value => ToDb[value], value => FromDb[value])
    {
    }

    private static readonly Dictionary<T, string> ToDb = BuildToDbMap();
    private static readonly Dictionary<string, T> FromDb =
        ToDb.ToDictionary(kv => kv.Value, kv => kv.Key);

    private static Dictionary<T, string> BuildToDbMap()
    {
        var map = new Dictionary<T, string>();
        foreach (var field in typeof(T).GetFields(BindingFlags.Public | BindingFlags.Static))
        {
            var value = (T)field.GetValue(null)!;
            var wireValue = field.GetCustomAttribute<EnumMemberAttribute>()?.Value ?? field.Name;
            map[value] = wireValue;
        }
        return map;
    }
}
