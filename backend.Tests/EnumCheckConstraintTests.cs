using Backend.Data;
using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace Backend.Tests;

/// <summary>
/// Round-trips one row through every enum-bearing table and asserts on the *raw string
/// stored in Postgres*, not just the value EF hands back — a symmetric-but-wrong
/// <c>EnumMemberConverter</c> round-trips perfectly in C# while writing the wrong casing
/// to the database. This is the single highest-value check for the whole schema
/// migration per docs/architecture/selfhost-migration.md §3.3/§6 risk #1: 7 of 11 enums
/// fail loudly with a bad converter (CHECK-constraint violation), 4 fail silently — this
/// test catches both categories the same way, by checking the actual column value.
///
/// Also asserts the CHECK constraints restored per Phase 1 review actually reject an
/// out-of-range value at the database, independently of anything C# does — the second,
/// db-level safety net the architecture doc calls for.
///
/// Requires a real Postgres reachable via `ConnectionStrings__TestConnection` (falls
/// back to `Host=localhost;Port=5432;Database=team_agile_hub_test;Username=app;Password=app`
/// — deliberately a *different* database name than the dev connection string, since this
/// fixture calls EnsureDeleted()/Migrate() and would destroy real data otherwise).
/// Could not be executed in the sandbox this was written in (no Docker/Postgres
/// available) — needs a run against the docker-compose `postgres` service, or any
/// reachable Postgres 17, before being trusted as a passing test.
///
/// Tagged RequiresPostgres so `dotnet test --filter Category!=RequiresPostgres` gives an
/// unambiguous clean run (e.g. EnumMemberConverterTests) without this class's connection
/// failures burying that signal in the overall result. CI / whoever has a reachable
/// Postgres runs the full suite without the filter.
/// </summary>
[Trait("Category", "RequiresPostgres")]
public class EnumCheckConstraintTests : IAsyncLifetime
{
    private AppDbContext _db = null!;

    public async Task InitializeAsync()
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__TestConnection")
            ?? "Host=localhost;Port=5432;Database=team_agile_hub_test;Username=app;Password=app";

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options;

        _db = new AppDbContext(options);

        // Throwaway database — always start from a clean, fully-migrated schema.
        await _db.Database.EnsureDeletedAsync();
        await _db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        await _db.Database.EnsureDeletedAsync();
        await _db.DisposeAsync();
    }

    [Fact]
    public async Task Every_enum_column_round_trips_the_EnumMember_wire_value()
    {
        // ── Build the FK chain: users -> teams -> team_members -> sprints -> ... ────
        var user = new User { DisplayName = "Test User", Email = "test@example.com" };
        _db.Users.Add(user);

        var team = new Team { Name = "Test Team", CreatedBy = user.Id };
        _db.Teams.Add(team);

        // TeamRole.Member -> "member": one of the 7 enums that fails *loudly* with a
        // wrong converter (ToString() would produce "Member", violating the CHECK).
        var teamMember = new TeamMember
        {
            TeamId = team.Id, UserId = user.Id, DisplayName = "Test User", Role = TeamRole.Member,
        };
        _db.TeamMembers.Add(teamMember);

        // SprintStatus.Active -> "active": also a loud one.
        var sprint = new Sprint
        {
            TeamId = team.Id, Name = "Sprint 1", Status = SprintStatus.Active,
            StartDate = DateTime.UtcNow, EndDate = DateTime.UtcNow.AddDays(14),
        };
        _db.Sprints.Add(sprint);

        // RetroPhase.Discuss -> "Discuss": one of the 4 that's PascalCase both ways —
        // the "works by coincidence" category that fails *silently* with a bad converter.
        var retroSession = new RetroSession
        {
            SprintId = sprint.Id, Name = "Retro", FacilitatorId = user.Id, Phase = RetroPhase.Discuss,
        };
        _db.RetroSessions.Add(retroSession);

        var retroCard = new RetroCard
        {
            RetroSessionId = retroSession.Id, AuthorId = user.Id, Column = "Went Well", Content = "test card",
        };
        _db.RetroCards.Add(retroCard);

        // ActionItemType.Retro -> "retro", ActionItemStatus.InProgress -> "in_progress":
        // both loud.
        var actionItem = new ActionItem
        {
            SprintId = sprint.Id, RetroSessionId = retroSession.Id, RetroCardId = retroCard.Id,
            Type = ActionItemType.Retro, Status = ActionItemStatus.InProgress, Text = "follow up",
        };
        _db.ActionItems.Add(actionItem);

        // FocusTopicStatus.AtRisk -> "at_risk": loud.
        var focusTopic = new FocusTopic { SprintId = sprint.Id, Title = "Topic", Status = FocusTopicStatus.AtRisk };
        _db.FocusTopics.Add(focusTopic);

        // BlockerStatus.InProgress -> "InProgress": silent category.
        var blocker = new Blocker
        {
            TeamId = team.Id, RaisedBy = user.Id, Title = "Blocker", Status = BlockerStatus.InProgress,
        };
        _db.Blockers.Add(blocker);

        // PokerDeckType.TShirt -> "TShirt", PokerSessionStatus.InProgress -> "InProgress":
        // both silent category — safe to reuse `sprint` since uniqueness is per-table.
        var pokerSession = new PokerSession
        {
            SprintId = sprint.Id, DeckType = PokerDeckType.TShirt, Status = PokerSessionStatus.InProgress,
        };
        _db.PokerSessions.Add(pokerSession);

        // SeatAssignment.Floating -> "floating": loud.
        var seat = new Seat
        {
            SeatNumber = 9999, Pod = "A", Facing = "N",
            OccupantId = user.Id, Assignment = SeatAssignment.Floating,
        };
        _db.Seats.Add(seat);

        // SeatDefectStatus.Closed -> "closed": loud.
        var defectReport = new SeatDefectReport
        {
            SeatId = seat.Id, ReportedBy = user.Id, ReporterName = "Test User",
            Reason = "wobbly", Status = SeatDefectStatus.Closed,
        };
        _db.SeatDefectReports.Add(defectReport);

        await _db.SaveChangesAsync();

        // ── Assert on the raw string Postgres actually stored, via plain ADO.NET —────
        // bypasses EF's own converter entirely so a symmetric-but-wrong converter can't
        // hide the failure from itself.
        Assert.Equal("member", await RawColumnValue("team_members", "role", teamMember.Id));
        Assert.Equal("active", await RawColumnValue("sprints", "status", sprint.Id));
        Assert.Equal("Discuss", await RawColumnValue("retro_sessions", "phase", retroSession.Id));
        Assert.Equal("retro", await RawColumnValue("action_items", "type", actionItem.Id));
        Assert.Equal("in_progress", await RawColumnValue("action_items", "status", actionItem.Id));
        Assert.Equal("at_risk", await RawColumnValue("focus_topics", "status", focusTopic.Id));
        Assert.Equal("InProgress", await RawColumnValue("blockers", "status", blocker.Id));
        Assert.Equal("TShirt", await RawColumnValue("poker_sessions", "deck_type", pokerSession.Id));
        Assert.Equal("InProgress", await RawColumnValue("poker_sessions", "status", pokerSession.Id));
        Assert.Equal("floating", await RawColumnValue("seats", "assignment", seat.Id));
        Assert.Equal("closed", await RawColumnValue("seat_defect_reports", "status", defectReport.Id));
    }

    [Fact]
    public async Task Team_member_role_rejects_an_out_of_range_value()
    {
        var user = new User { DisplayName = "Test User" };
        var team = new Team { Name = "Test Team", CreatedBy = user.Id };
        _db.Users.Add(user);
        _db.Teams.Add(team);
        await _db.SaveChangesAsync();

        await AssertCheckViolation(
            "insert into team_members (id, team_id, user_id, display_name, role) " +
            "values ($1, $2, $3, 'x', 'Bogus')",
            Guid.NewGuid(), team.Id, user.Id);
    }

    [Fact]
    public async Task Sprint_status_rejects_an_out_of_range_value()
    {
        var user = new User { DisplayName = "Test User" };
        var team = new Team { Name = "Test Team", CreatedBy = user.Id };
        _db.Users.Add(user);
        _db.Teams.Add(team);
        await _db.SaveChangesAsync();

        await AssertCheckViolation(
            "insert into sprints (id, team_id, name, start_date, end_date, status) " +
            "values ($1, $2, 'Sprint', now(), now(), 'Bogus')",
            Guid.NewGuid(), team.Id);
    }

    [Fact]
    public async Task Retro_phase_rejects_an_out_of_range_value()
    {
        // The one enum CHECK that has no historical precedent in the original schema
        // (010's comment only ever discusses casing, not presence) — added purely as a
        // forward-looking safety net per architect review, so worth its own explicit
        // negative test rather than assuming it behaves like the other 10.
        await AssertCheckViolation(
            "insert into retro_sessions (id, name, phase) values ($1, 'Retro', 'Bogus')",
            Guid.NewGuid());
    }

    [Fact]
    public async Task Mood_checkin_range_rejects_an_out_of_range_value()
    {
        var user = new User { DisplayName = "Test User" };
        var team = new Team { Name = "Test Team", CreatedBy = user.Id };
        _db.Users.Add(user);
        _db.Teams.Add(team);
        await _db.SaveChangesAsync();
        var sprint = new Sprint
        {
            TeamId = team.Id, Name = "Sprint", StartDate = DateTime.UtcNow, EndDate = DateTime.UtcNow,
        };
        _db.Sprints.Add(sprint);
        await _db.SaveChangesAsync();
        var session = new RetroSession { SprintId = sprint.Id, Name = "Retro" };
        _db.RetroSessions.Add(session);
        await _db.SaveChangesAsync();

        await AssertCheckViolation(
            "insert into mood_checkins (id, retro_session_id, user_id, entry_mood) " +
            "values ($1, $2, $3, 99)",
            Guid.NewGuid(), session.Id, user.Id);
    }

    /// <summary>
    /// Runs <paramref name="sql"/> (test-authored, not user input — safe to build with
    /// positional Npgsql parameters `$1..$n`) and asserts it fails with Postgres'
    /// check_violation code, proving the CHECK constraint — not application code — is
    /// what rejected it.
    /// </summary>
    private async Task AssertCheckViolation(string sql, params object[] parameters)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
        {
            await conn.OpenAsync();
        }

        await using var cmd = new NpgsqlCommand(sql, conn);
        foreach (var p in parameters)
        {
            cmd.Parameters.AddWithValue(p);
        }

        var ex = await Assert.ThrowsAsync<PostgresException>(() => cmd.ExecuteNonQueryAsync());
        Assert.Equal("23514", ex.SqlState); // check_violation
    }

    private async Task<string?> RawColumnValue(string table, string column, Guid id)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
        {
            await conn.OpenAsync();
        }

        await using var cmd = new NpgsqlCommand($"select {column} from {table} where id = $1", conn);
        cmd.Parameters.AddWithValue(id);
        return (string?)await cmd.ExecuteScalarAsync();
    }
}
