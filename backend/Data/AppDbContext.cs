using Backend.Data.Converters;
using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Backend.Data;

/// <summary>
/// Replaces <c>SupabaseService</c> (the supabase-csharp client wrapper) as the backend's
/// entire data layer. See docs/architecture/selfhost-migration.md §3 for the full design
/// this implements.
///
/// Registered scoped in Program.cs (EF Core's default lifetime for AddDbContext).
/// AuthorizationService and RetroParticipantService take this as a constructor
/// dependency and are registered scoped to match (architecture doc §3.6 / finding 0.3);
/// JiraEncryptionService has no DB dependency and stays a singleton.
/// </summary>
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();

    public DbSet<Team> Teams => Set<Team>();
    public DbSet<TeamMember> TeamMembers => Set<TeamMember>();

    public DbSet<Sprint> Sprints => Set<Sprint>();
    public DbSet<SprintMember> SprintMembers => Set<SprintMember>();
    public DbSet<SprintTraining> SprintTrainings => Set<SprintTraining>();

    public DbSet<RetroSession> RetroSessions => Set<RetroSession>();
    public DbSet<RetroCard> RetroCards => Set<RetroCard>();
    public DbSet<RetroVote> RetroVotes => Set<RetroVote>();
    public DbSet<MoodCheckin> MoodCheckins => Set<MoodCheckin>();
    public DbSet<RetroParticipant> RetroParticipants => Set<RetroParticipant>();
    public DbSet<RetroTemplate> RetroTemplates => Set<RetroTemplate>();

    public DbSet<PokerSession> PokerSessions => Set<PokerSession>();
    public DbSet<PokerTicket> PokerTickets => Set<PokerTicket>();
    public DbSet<PokerVote> PokerVotes => Set<PokerVote>();

    public DbSet<ActionItem> ActionItems => Set<ActionItem>();
    public DbSet<Blocker> Blockers => Set<Blocker>();

    public DbSet<FocusTopic> FocusTopics => Set<FocusTopic>();
    public DbSet<RecurringAgendaItem> RecurringAgendaItems => Set<RecurringAgendaItem>();
    public DbSet<TalkingPoint> TalkingPoints => Set<TalkingPoint>();
    public DbSet<TalkingPointNote> TalkingPointNotes => Set<TalkingPointNote>();

    public DbSet<Icebreaker> Icebreakers => Set<Icebreaker>();
    public DbSet<JiraIntegration> JiraIntegrations => Set<JiraIntegration>();

    public DbSet<Seat> Seats => Set<Seat>();
    public DbSet<SeatDefectReport> SeatDefectReports => Set<SeatDefectReport>();

    public DbSet<PlatformAdmin> PlatformAdmins => Set<PlatformAdmin>();
    public DbSet<PlatformAdminAllowlist> PlatformAdminAllowlist => Set<PlatformAdminAllowlist>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        // Applied globally so no per-entity configuration can forget either — see
        // docs/architecture/selfhost-migration.md §3.3 (enums) and the "app generates
        // every id, DB default is a defense-in-depth fallback only" convention used
        // throughout this model (§1.2's `gen_random_uuid()` note, generalised to every
        // table since 001's `uuid_generate_v4()` default is being dropped everywhere,
        // not just on `users`).
        ApplyEnumMemberConversions(modelBuilder);
        ApplyIdGenerationConvention(modelBuilder);
    }

    /// <summary>
    /// Converts every enum-typed property via <see cref="EnumMemberConverter{T}"/>
    /// instead of the default <c>Enum.ToString()</c>. Deliberately not
    /// <c>HasConversion&lt;string&gt;()</c> — see architecture doc §3.3 and the
    /// converter's own doc comment.
    /// </summary>
    private static void ApplyEnumMemberConversions(ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.ClrType.GetProperties())
            {
                var propertyType = Nullable.GetUnderlyingType(property.PropertyType) ?? property.PropertyType;
                if (!propertyType.IsEnum)
                {
                    continue;
                }

                var converterType = typeof(EnumMemberConverter<>).MakeGenericType(propertyType);
                var converter = (ValueConverter)Activator.CreateInstance(converterType)!;

                modelBuilder.Entity(entityType.ClrType).Property(property.Name).HasConversion(converter);
            }
        }
    }

    /// <summary>
    /// Every entity's <c>Id</c> is a GUID the application always sets itself (every
    /// model defaults to <c>= Guid.NewGuid()</c>) — so EF is told not to expect the
    /// database to generate it, while the column still carries a
    /// <c>gen_random_uuid()</c> default for anything that inserts outside the app
    /// (seed data written directly in SQL, manual psql, etc). Replaces the dropped
    /// <c>uuid-ossp</c> extension's <c>uuid_generate_v4()</c> default from
    /// 001_initial_schema.sql — see architecture doc §1.2.
    /// </summary>
    private static void ApplyIdGenerationConvention(ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            var idProperty = entityType.FindProperty("Id");
            if (idProperty is null || idProperty.ClrType != typeof(Guid))
            {
                continue;
            }

            idProperty.ValueGenerated = ValueGenerated.Never;
            idProperty.SetDefaultValueSql("gen_random_uuid()");
        }
    }
}
