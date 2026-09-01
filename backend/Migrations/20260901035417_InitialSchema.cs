using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace backend.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "icebreakers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    text = table.Column<string>(type: "text", maxLength: 500, nullable: false),
                    category = table.Column<string>(type: "text", maxLength: 50, nullable: false),
                    source = table.Column<string>(type: "text", maxLength: 10, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_icebreakers", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "platform_admin_allowlist",
                columns: table => new
                {
                    email = table.Column<string>(type: "text", nullable: false),
                    note = table.Column<string>(type: "text", nullable: true),
                    added_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_platform_admin_allowlist", x => x.email);
                    table.CheckConstraint("platform_admin_allowlist_email_lowercase", "email = lower(email)");
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    entra_object_id = table.Column<Guid>(type: "uuid", nullable: true),
                    entra_tenant_id = table.Column<Guid>(type: "uuid", nullable: true),
                    email = table.Column<string>(type: "text", nullable: true),
                    display_name = table.Column<string>(type: "text", nullable: false),
                    is_anonymous = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    last_login_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                    table.CheckConstraint("users_guest_has_no_entra_id", "not is_anonymous or entra_object_id is null");
                });

            migrationBuilder.CreateTable(
                name: "platform_admins",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    granted_by = table.Column<Guid>(type: "uuid", nullable: true),
                    granted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_platform_admins", x => x.user_id);
                    table.ForeignKey(
                        name: "fk_platform_admins_users_granted_by",
                        column: x => x.granted_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_platform_admins_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "retro_templates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    name = table.Column<string>(type: "text", maxLength: 60, nullable: false),
                    columns_json = table.Column<string>(type: "text", nullable: false),
                    is_builtin = table.Column<bool>(type: "boolean", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_retro_templates", x => x.id);
                    table.ForeignKey(
                        name: "fk_retro_templates_users_created_by",
                        column: x => x.created_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "seats",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    seat_number = table.Column<int>(type: "integer", nullable: false),
                    pod = table.Column<string>(type: "text", nullable: false),
                    facing = table.Column<string>(type: "text", nullable: false),
                    has_dock = table.Column<bool>(type: "boolean", nullable: false),
                    has_terminal = table.Column<bool>(type: "boolean", nullable: false),
                    out_of_service = table.Column<bool>(type: "boolean", nullable: false),
                    note = table.Column<string>(type: "text", nullable: true),
                    occupant_id = table.Column<Guid>(type: "uuid", nullable: true),
                    occupant_name = table.Column<string>(type: "text", nullable: true),
                    assignment = table.Column<string>(type: "text", nullable: true),
                    assigned_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_seats", x => x.id);
                    table.CheckConstraint("seats_assignment_check", "assignment in ('permanent', 'floating')");
                    table.CheckConstraint("seats_assignment_consistency", "(occupant_id is null and assignment is null) or (occupant_id is not null and assignment is not null)");
                    table.CheckConstraint("seats_facing_check", "facing in ('N', 'E', 'S', 'W')");
                    table.CheckConstraint("seats_pod_check", "pod in ('HEX', 'A', 'B', 'C', 'D', 'E', 'F')");
                    table.ForeignKey(
                        name: "fk_seats_users_occupant_id",
                        column: x => x.occupant_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "teams",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    name = table.Column<string>(type: "text", nullable: false),
                    sprint_term = table.Column<string>(type: "text", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_teams", x => x.id);
                    table.CheckConstraint("teams_name_length", "char_length(name) <= 100");
                    table.CheckConstraint("teams_sprint_term_length", "char_length(sprint_term) <= 30");
                    table.ForeignKey(
                        name: "fk_teams_users_created_by",
                        column: x => x.created_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "seat_defect_reports",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    seat_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reported_by = table.Column<Guid>(type: "uuid", nullable: false),
                    reporter_name = table.Column<string>(type: "text", nullable: false),
                    reason = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    resolution_note = table.Column<string>(type: "text", nullable: true),
                    closed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    closed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_seat_defect_reports", x => x.id);
                    table.CheckConstraint("seat_defect_reports_status_check", "status in ('open', 'closed')");
                    table.ForeignKey(
                        name: "fk_seat_defect_reports_seats_seat_id",
                        column: x => x.seat_id,
                        principalTable: "seats",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_seat_defect_reports_users_closed_by",
                        column: x => x.closed_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_seat_defect_reports_users_reported_by",
                        column: x => x.reported_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "jira_integrations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    team_id = table.Column<Guid>(type: "uuid", nullable: false),
                    cloud_id = table.Column<string>(type: "text", nullable: false),
                    cloud_name = table.Column<string>(type: "text", nullable: false),
                    access_token_encrypted = table.Column<string>(type: "text", nullable: false),
                    refresh_token_encrypted = table.Column<string>(type: "text", nullable: false),
                    token_expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_jira_integrations", x => x.id);
                    table.ForeignKey(
                        name: "fk_jira_integrations_teams_team_id",
                        column: x => x.team_id,
                        principalTable: "teams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "recurring_agenda_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    team_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    last_status = table.Column<string>(type: "text", nullable: true),
                    snoozed_until_sprint_number = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_recurring_agenda_items", x => x.id);
                    table.ForeignKey(
                        name: "fk_recurring_agenda_items_teams_team_id",
                        column: x => x.team_id,
                        principalTable: "teams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "sprints",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    team_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    goal = table.Column<string>(type: "text", nullable: true),
                    previous_goal = table.Column<string>(type: "text", nullable: true),
                    champion_id = table.Column<Guid>(type: "uuid", nullable: true),
                    start_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    end_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sprints", x => x.id);
                    table.CheckConstraint("sprints_status_check", "status in ('planning', 'active', 'completed')");
                    table.ForeignKey(
                        name: "fk_sprints_teams_team_id",
                        column: x => x.team_id,
                        principalTable: "teams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_sprints_users_champion_id",
                        column: x => x.champion_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "team_members",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    team_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    display_name = table.Column<string>(type: "text", nullable: false),
                    avatar_url = table.Column<string>(type: "text", nullable: true),
                    role = table.Column<string>(type: "text", nullable: false),
                    joined_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_team_members", x => x.id);
                    table.CheckConstraint("team_members_role_check", "role in ('member', 'admin')");
                    table.ForeignKey(
                        name: "fk_team_members_teams_team_id",
                        column: x => x.team_id,
                        principalTable: "teams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_team_members_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "blockers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    team_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sprint_id = table.Column<Guid>(type: "uuid", nullable: true),
                    title = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    raised_by = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    jira_issue_id = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_blockers", x => x.id);
                    table.CheckConstraint("blockers_status_check", "status in ('Open', 'InProgress', 'Resolved')");
                    table.ForeignKey(
                        name: "fk_blockers_sprints_sprint_id",
                        column: x => x.sprint_id,
                        principalTable: "sprints",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_blockers_teams_team_id",
                        column: x => x.team_id,
                        principalTable: "teams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_blockers_users_owner_id",
                        column: x => x.owner_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_blockers_users_raised_by",
                        column: x => x.raised_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "focus_topics",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    sprint_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    content = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_focus_topics", x => x.id);
                    table.CheckConstraint("focus_topics_status_check", "status in ('on_track', 'at_risk', 'on_hold', 'done')");
                    table.ForeignKey(
                        name: "fk_focus_topics_sprints_sprint_id",
                        column: x => x.sprint_id,
                        principalTable: "sprints",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "poker_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    sprint_id = table.Column<Guid>(type: "uuid", nullable: false),
                    deck_type = table.Column<string>(type: "text", nullable: false),
                    custom_deck_json = table.Column<string>(type: "text", nullable: true),
                    facilitator_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    current_ticket_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_poker_sessions", x => x.id);
                    table.CheckConstraint("poker_sessions_deck_type_check", "deck_type in ('Fibonacci', 'TShirt', 'Custom')");
                    table.CheckConstraint("poker_sessions_status_check", "status in ('Pending', 'InProgress', 'Completed')");
                    table.ForeignKey(
                        name: "fk_poker_sessions_sprints_sprint_id",
                        column: x => x.sprint_id,
                        principalTable: "sprints",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_poker_sessions_users_facilitator_id",
                        column: x => x.facilitator_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "retro_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    name = table.Column<string>(type: "text", maxLength: 120, nullable: false),
                    sprint_id = table.Column<Guid>(type: "uuid", nullable: true),
                    facilitator_id = table.Column<Guid>(type: "uuid", nullable: true),
                    phase = table.Column<string>(type: "text", nullable: false),
                    columns_json = table.Column<string>(type: "text", nullable: false),
                    vote_count = table.Column<int>(type: "integer", nullable: false),
                    hide_votes_until_revealed = table.Column<bool>(type: "boolean", nullable: false),
                    skip_mood_checkins = table.Column<bool>(type: "boolean", nullable: false),
                    skip_icebreaker = table.Column<bool>(type: "boolean", nullable: false),
                    current_speaker_id = table.Column<Guid>(type: "uuid", nullable: true),
                    speaker_order_json = table.Column<string>(type: "text", nullable: true),
                    icebreaker_question = table.Column<string>(type: "text", maxLength: 500, nullable: true),
                    active_discussion_card_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    invite_code = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_retro_sessions", x => x.id);
                    table.CheckConstraint("retro_sessions_phase_check", "phase in ('CheckIn', 'Icebreaker', 'Write', 'Group', 'Vote', 'Discuss', 'WrapUp', 'Completed')");
                    table.ForeignKey(
                        name: "fk_retro_sessions_sprints_sprint_id",
                        column: x => x.sprint_id,
                        principalTable: "sprints",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_retro_sessions_users_facilitator_id",
                        column: x => x.facilitator_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "sprint_members",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    sprint_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    days_off = table.Column<string>(type: "text", nullable: true),
                    capacity_score = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sprint_members", x => x.id);
                    table.CheckConstraint("sprint_members_capacity_score_check", "capacity_score between 1 and 10");
                    table.ForeignKey(
                        name: "fk_sprint_members_sprints_sprint_id",
                        column: x => x.sprint_id,
                        principalTable: "sprints",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_sprint_members_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "sprint_trainings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    sprint_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sprint_trainings", x => x.id);
                    table.ForeignKey(
                        name: "fk_sprint_trainings_sprints_sprint_id",
                        column: x => x.sprint_id,
                        principalTable: "sprints",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_sprint_trainings_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "talking_points",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    focus_topic_id = table.Column<Guid>(type: "uuid", nullable: true),
                    agenda_item_id = table.Column<Guid>(type: "uuid", nullable: true),
                    text = table.Column<string>(type: "text", nullable: false),
                    order = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_talking_points", x => x.id);
                    table.CheckConstraint("talking_point_has_one_parent", "(focus_topic_id is not null)::int + (agenda_item_id is not null)::int = 1");
                    table.ForeignKey(
                        name: "fk_talking_points_focus_topics_focus_topic_id",
                        column: x => x.focus_topic_id,
                        principalTable: "focus_topics",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_talking_points_recurring_agenda_items_agenda_item_id",
                        column: x => x.agenda_item_id,
                        principalTable: "recurring_agenda_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "poker_tickets",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    poker_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    jira_issue_id = table.Column<string>(type: "text", nullable: true),
                    title = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    final_points = table.Column<int>(type: "integer", nullable: true),
                    votes_revealed = table.Column<bool>(type: "boolean", nullable: false),
                    order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_poker_tickets", x => x.id);
                    table.ForeignKey(
                        name: "fk_poker_tickets_poker_sessions_poker_session_id",
                        column: x => x.poker_session_id,
                        principalTable: "poker_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "mood_checkins",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    retro_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    entry_mood = table.Column<int>(type: "integer", nullable: true),
                    exit_mood = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_mood_checkins", x => x.id);
                    table.CheckConstraint("mood_checkins_entry_mood_check", "entry_mood between 1 and 5");
                    table.CheckConstraint("mood_checkins_exit_mood_check", "exit_mood between 1 and 5");
                    table.ForeignKey(
                        name: "fk_mood_checkins_retro_sessions_retro_session_id",
                        column: x => x.retro_session_id,
                        principalTable: "retro_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_mood_checkins_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "retro_cards",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    retro_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    author_id = table.Column<Guid>(type: "uuid", nullable: false),
                    column = table.Column<string>(type: "text", maxLength: 50, nullable: false),
                    content = table.Column<string>(type: "text", maxLength: 1000, nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    group_label = table.Column<string>(type: "text", maxLength: 100, nullable: true),
                    discussion_notes = table.Column<string>(type: "text", nullable: true),
                    is_revealed = table.Column<bool>(type: "boolean", nullable: false),
                    is_discussed = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_retro_cards", x => x.id);
                    table.ForeignKey(
                        name: "fk_retro_cards_retro_sessions_retro_session_id",
                        column: x => x.retro_session_id,
                        principalTable: "retro_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_retro_cards_users_author_id",
                        column: x => x.author_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "retro_participants",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    retro_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    display_name = table.Column<string>(type: "text", nullable: false),
                    is_anonymous = table.Column<bool>(type: "boolean", nullable: false),
                    is_host = table.Column<bool>(type: "boolean", nullable: false),
                    joined_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_retro_participants", x => x.id);
                    table.ForeignKey(
                        name: "fk_retro_participants_retro_sessions_retro_session_id",
                        column: x => x.retro_session_id,
                        principalTable: "retro_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_retro_participants_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "talking_point_notes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    talking_point_id = table.Column<Guid>(type: "uuid", nullable: false),
                    author_id = table.Column<Guid>(type: "uuid", nullable: false),
                    content = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_talking_point_notes", x => x.id);
                    table.ForeignKey(
                        name: "fk_talking_point_notes_talking_points_talking_point_id",
                        column: x => x.talking_point_id,
                        principalTable: "talking_points",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_talking_point_notes_users_author_id",
                        column: x => x.author_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "poker_votes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    poker_ticket_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    estimate = table.Column<string>(type: "text", nullable: false),
                    revealed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_poker_votes", x => x.id);
                    table.ForeignKey(
                        name: "fk_poker_votes_poker_tickets_poker_ticket_id",
                        column: x => x.poker_ticket_id,
                        principalTable: "poker_tickets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_poker_votes_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "action_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    sprint_id = table.Column<Guid>(type: "uuid", nullable: true),
                    type = table.Column<string>(type: "text", nullable: false),
                    assignee_id = table.Column<Guid>(type: "uuid", nullable: true),
                    text = table.Column<string>(type: "text", nullable: false),
                    due_date = table.Column<DateOnly>(type: "date", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    carried_from_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    talking_point_id = table.Column<Guid>(type: "uuid", nullable: true),
                    retro_card_id = table.Column<Guid>(type: "uuid", nullable: true),
                    retro_session_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_action_items", x => x.id);
                    table.CheckConstraint("action_items_scope_check", "sprint_id is not null or retro_session_id is not null");
                    table.CheckConstraint("action_items_status_check", "status in ('open', 'in_progress', 'done', 'carried_over', 'dropped')");
                    table.CheckConstraint("action_items_type_check", "type in ('retro', 'planning')");
                    table.ForeignKey(
                        name: "fk_action_items_action_items_carried_from_id",
                        column: x => x.carried_from_id,
                        principalTable: "action_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_action_items_retro_cards_retro_card_id",
                        column: x => x.retro_card_id,
                        principalTable: "retro_cards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_action_items_retro_sessions_retro_session_id",
                        column: x => x.retro_session_id,
                        principalTable: "retro_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_action_items_sprints_sprint_id",
                        column: x => x.sprint_id,
                        principalTable: "sprints",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_action_items_talking_points_talking_point_id",
                        column: x => x.talking_point_id,
                        principalTable: "talking_points",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_action_items_users_assignee_id",
                        column: x => x.assignee_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "retro_votes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    retro_card_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_retro_votes", x => x.id);
                    table.ForeignKey(
                        name: "fk_retro_votes_retro_cards_retro_card_id",
                        column: x => x.retro_card_id,
                        principalTable: "retro_cards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_retro_votes_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "icebreakers",
                columns: new[] { "id", "category", "source", "text" },
                values: new object[,]
                {
                    { new Guid("a1000001-0000-0000-0000-000000000001"), "quick", "seeded", "What's one thing you're looking forward to this week?" },
                    { new Guid("a1000001-0000-0000-0000-000000000002"), "fun", "seeded", "If you could have any superpower for just today, what would it be?" },
                    { new Guid("a1000001-0000-0000-0000-000000000003"), "team-building", "seeded", "What's the best piece of advice you've ever received?" },
                    { new Guid("a1000001-0000-0000-0000-000000000004"), "team-building", "seeded", "What's a skill you've picked up in the last year that surprised you?" },
                    { new Guid("a1000001-0000-0000-0000-000000000005"), "retro", "seeded", "If your current project was a movie, what genre would it be?" },
                    { new Guid("a1000001-0000-0000-0000-000000000006"), "quick", "seeded", "What emoji best describes how you're feeling right now?" },
                    { new Guid("a1000001-0000-0000-0000-000000000007"), "fun", "seeded", "What's one thing outside of work you've been enjoying lately?" },
                    { new Guid("a1000001-0000-0000-0000-000000000008"), "team-building", "seeded", "What's your go-to strategy when you're stuck on a hard problem?" },
                    { new Guid("a1000001-0000-0000-0000-000000000009"), "retro", "seeded", "If the sprint was a road trip, where did we end up vs. where we planned to go?" },
                    { new Guid("a1000001-0000-0000-0000-000000000010"), "retro", "seeded", "What's one word that describes last sprint?" },
                    { new Guid("a1000001-0000-0000-0000-000000000011"), "team-building", "seeded", "What's a tool or shortcut you've discovered recently that saves you time?" },
                    { new Guid("a1000001-0000-0000-0000-000000000012"), "team-building", "seeded", "What's the most interesting thing you've learned in the last two weeks?" },
                    { new Guid("a1000001-0000-0000-0000-000000000013"), "retro", "seeded", "If you could change one thing about how the team communicates, what would it be?" },
                    { new Guid("a1000001-0000-0000-0000-000000000014"), "fun", "seeded", "What's something small that made your day better recently?" },
                    { new Guid("a1000001-0000-0000-0000-000000000015"), "fun", "seeded", "If you had a theme song that played when you entered a room, what would it be?" },
                    { new Guid("a1000001-0000-0000-0000-000000000016"), "team-building", "seeded", "What's the most challenging part of remote/hybrid work for you?" },
                    { new Guid("a1000001-0000-0000-0000-000000000017"), "team-building", "seeded", "What's a technical concept you wish you had learned earlier in your career?" },
                    { new Guid("a1000001-0000-0000-0000-000000000018"), "fun", "seeded", "What's the last thing that made you laugh out loud?" },
                    { new Guid("a1000001-0000-0000-0000-000000000019"), "fun", "seeded", "If the team was a band, what instrument would each person play?" },
                    { new Guid("a1000001-0000-0000-0000-000000000020"), "quick", "seeded", "What's one habit you're trying to build or break right now?" }
                });

            migrationBuilder.InsertData(
                table: "platform_admin_allowlist",
                columns: new[] { "email", "added_at", "note" },
                values: new object[] { "maxime.beaulieu@amilia.com", new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "bootstrap admin — migration 019" });

            migrationBuilder.CreateIndex(
                name: "ix_action_items_assignee_id",
                table: "action_items",
                column: "assignee_id");

            migrationBuilder.CreateIndex(
                name: "ix_action_items_carried_from_id",
                table: "action_items",
                column: "carried_from_id");

            migrationBuilder.CreateIndex(
                name: "ix_action_items_retro_card_id",
                table: "action_items",
                column: "retro_card_id");

            migrationBuilder.CreateIndex(
                name: "ix_action_items_retro_session_id",
                table: "action_items",
                column: "retro_session_id");

            migrationBuilder.CreateIndex(
                name: "ix_action_items_sprint_id",
                table: "action_items",
                column: "sprint_id");

            migrationBuilder.CreateIndex(
                name: "ix_action_items_talking_point_id",
                table: "action_items",
                column: "talking_point_id");

            migrationBuilder.CreateIndex(
                name: "ix_blockers_owner_id",
                table: "blockers",
                column: "owner_id");

            migrationBuilder.CreateIndex(
                name: "ix_blockers_raised_by",
                table: "blockers",
                column: "raised_by");

            migrationBuilder.CreateIndex(
                name: "ix_blockers_sprint_id",
                table: "blockers",
                column: "sprint_id");

            migrationBuilder.CreateIndex(
                name: "ix_blockers_team_id",
                table: "blockers",
                column: "team_id");

            migrationBuilder.CreateIndex(
                name: "ix_focus_topics_sprint_id",
                table: "focus_topics",
                column: "sprint_id");

            migrationBuilder.CreateIndex(
                name: "ix_jira_integrations_team_id",
                table: "jira_integrations",
                column: "team_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_mood_checkins_retro_session_id_user_id",
                table: "mood_checkins",
                columns: new[] { "retro_session_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_mood_checkins_user_id",
                table: "mood_checkins",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_platform_admins_granted_by",
                table: "platform_admins",
                column: "granted_by");

            migrationBuilder.CreateIndex(
                name: "ix_poker_sessions_facilitator_id",
                table: "poker_sessions",
                column: "facilitator_id");

            migrationBuilder.CreateIndex(
                name: "ix_poker_sessions_sprint_id",
                table: "poker_sessions",
                column: "sprint_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_poker_tickets_poker_session_id",
                table: "poker_tickets",
                column: "poker_session_id");

            migrationBuilder.CreateIndex(
                name: "ix_poker_votes_poker_ticket_id_user_id",
                table: "poker_votes",
                columns: new[] { "poker_ticket_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_poker_votes_user_id",
                table: "poker_votes",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_agenda_items_team_id",
                table: "recurring_agenda_items",
                column: "team_id");

            migrationBuilder.CreateIndex(
                name: "ix_retro_cards_author_id",
                table: "retro_cards",
                column: "author_id");

            migrationBuilder.CreateIndex(
                name: "ix_retro_cards_retro_session_id",
                table: "retro_cards",
                column: "retro_session_id");

            migrationBuilder.CreateIndex(
                name: "ix_retro_participants_retro_session_id_user_id",
                table: "retro_participants",
                columns: new[] { "retro_session_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_retro_participants_user_id",
                table: "retro_participants",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_retro_sessions_facilitator_id",
                table: "retro_sessions",
                column: "facilitator_id");

            migrationBuilder.CreateIndex(
                name: "ix_retro_sessions_invite_code",
                table: "retro_sessions",
                column: "invite_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "retro_sessions_sprint_id_key",
                table: "retro_sessions",
                column: "sprint_id",
                unique: true,
                filter: "sprint_id is not null");

            migrationBuilder.CreateIndex(
                name: "ix_retro_templates_created_by",
                table: "retro_templates",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "ix_retro_votes_retro_card_id_user_id",
                table: "retro_votes",
                columns: new[] { "retro_card_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_retro_votes_user_id",
                table: "retro_votes",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_seat_defect_reports_closed_by",
                table: "seat_defect_reports",
                column: "closed_by");

            migrationBuilder.CreateIndex(
                name: "ix_seat_defect_reports_reported_by",
                table: "seat_defect_reports",
                column: "reported_by");

            migrationBuilder.CreateIndex(
                name: "seat_defect_reports_seat_idx",
                table: "seat_defect_reports",
                column: "seat_id");

            migrationBuilder.CreateIndex(
                name: "seat_defect_reports_status_idx",
                table: "seat_defect_reports",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_seats_seat_number",
                table: "seats",
                column: "seat_number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "seats_occupant_idx",
                table: "seats",
                column: "occupant_id");

            migrationBuilder.CreateIndex(
                name: "ix_sprint_members_sprint_id_user_id",
                table: "sprint_members",
                columns: new[] { "sprint_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_sprint_members_user_id",
                table: "sprint_members",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_sprint_trainings_sprint_id_user_id",
                table: "sprint_trainings",
                columns: new[] { "sprint_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_sprint_trainings_user_id",
                table: "sprint_trainings",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_sprints_champion_id",
                table: "sprints",
                column: "champion_id");

            migrationBuilder.CreateIndex(
                name: "ix_sprints_team_id",
                table: "sprints",
                column: "team_id");

            migrationBuilder.CreateIndex(
                name: "ix_talking_point_notes_author_id",
                table: "talking_point_notes",
                column: "author_id");

            migrationBuilder.CreateIndex(
                name: "ix_talking_point_notes_talking_point_id",
                table: "talking_point_notes",
                column: "talking_point_id");

            migrationBuilder.CreateIndex(
                name: "ix_talking_points_agenda_item_id",
                table: "talking_points",
                column: "agenda_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_talking_points_focus_topic_id",
                table: "talking_points",
                column: "focus_topic_id");

            migrationBuilder.CreateIndex(
                name: "ix_team_members_team_id_user_id",
                table: "team_members",
                columns: new[] { "team_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_team_members_user_id",
                table: "team_members",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_teams_created_by",
                table: "teams",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "users_entra_object_id_key",
                table: "users",
                column: "entra_object_id",
                unique: true,
                filter: "entra_object_id is not null");

            // Expression index on lower(email) — architecture doc §1.2. EF Core's fluent
            // index API has no equivalent for an index on a computed expression over a
            // plain (non-generated) column, so this one is raw SQL rather than
            // CreateIndex(); hand-added here, not produced by `dotnet ef migrations add`.
            migrationBuilder.Sql(
                "create index users_email_lower_idx on users (lower(email));");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "action_items");

            migrationBuilder.DropTable(
                name: "blockers");

            migrationBuilder.DropTable(
                name: "icebreakers");

            migrationBuilder.DropTable(
                name: "jira_integrations");

            migrationBuilder.DropTable(
                name: "mood_checkins");

            migrationBuilder.DropTable(
                name: "platform_admin_allowlist");

            migrationBuilder.DropTable(
                name: "platform_admins");

            migrationBuilder.DropTable(
                name: "poker_votes");

            migrationBuilder.DropTable(
                name: "retro_participants");

            migrationBuilder.DropTable(
                name: "retro_templates");

            migrationBuilder.DropTable(
                name: "retro_votes");

            migrationBuilder.DropTable(
                name: "seat_defect_reports");

            migrationBuilder.DropTable(
                name: "sprint_members");

            migrationBuilder.DropTable(
                name: "sprint_trainings");

            migrationBuilder.DropTable(
                name: "talking_point_notes");

            migrationBuilder.DropTable(
                name: "team_members");

            migrationBuilder.DropTable(
                name: "poker_tickets");

            migrationBuilder.DropTable(
                name: "retro_cards");

            migrationBuilder.DropTable(
                name: "seats");

            migrationBuilder.DropTable(
                name: "talking_points");

            migrationBuilder.DropTable(
                name: "poker_sessions");

            migrationBuilder.DropTable(
                name: "retro_sessions");

            migrationBuilder.DropTable(
                name: "focus_topics");

            migrationBuilder.DropTable(
                name: "recurring_agenda_items");

            migrationBuilder.DropTable(
                name: "sprints");

            migrationBuilder.DropTable(
                name: "teams");

            migrationBuilder.DropTable(
                name: "users");
        }
    }
}
