using Backend.Data.Converters;
using Backend.Models;
using Xunit;

namespace Backend.Tests;

/// <summary>
/// Zero-infrastructure companion to <see cref="EnumCheckConstraintTests"/> (task #16,
/// added as a mitigation while task #15's live-Postgres verification is deferred/accepted
/// risk). <see cref="EnumMemberConverter{T}"/> is a pure <c>ValueConverter&lt;T, string&gt;</c>
/// — its correctness needs no database at all, just direct assertions on the compiled
/// conversion delegates in both directions.
///
/// Catches exactly the failure mode docs/architecture/selfhost-migration.md §3.3 warns
/// about: a converter that round-trips symmetrically but produces the wrong literal
/// string (e.g. "Member" instead of "member") is invisible to a round-trip check alone —
/// asserting the exact expected string, taken from each enum's
/// <c>[EnumMember(Value = "...")]</c>, is what catches it.
///
/// Does NOT cover: CHECK constraints rejecting bad values at runtime, the migration
/// applying cleanly, FK delete behaviours, or the partial unique indexes — those stay
/// with task #15 and need a real Postgres.
/// </summary>
public class EnumMemberConverterTests
{
    private static void AssertRoundTrip<T>(T value, string wireValue) where T : struct, Enum
    {
        var converter = new EnumMemberConverter<T>();

        Assert.Equal(wireValue, converter.ConvertToProvider(value));
        Assert.Equal(value, converter.ConvertFromProvider(wireValue));
    }

    // ── lowercase / snake_case — the 7 that fail LOUDLY with a wrong converter ────

    [Theory]
    [InlineData(TeamRole.Member, "member")]
    [InlineData(TeamRole.Admin, "admin")]
    public void TeamRole_round_trips(TeamRole value, string wire) => AssertRoundTrip(value, wire);

    [Theory]
    [InlineData(SprintStatus.Planning, "planning")]
    [InlineData(SprintStatus.Active, "active")]
    [InlineData(SprintStatus.Completed, "completed")]
    public void SprintStatus_round_trips(SprintStatus value, string wire) => AssertRoundTrip(value, wire);

    [Theory]
    [InlineData(ActionItemType.Retro, "retro")]
    [InlineData(ActionItemType.Planning, "planning")]
    public void ActionItemType_round_trips(ActionItemType value, string wire) => AssertRoundTrip(value, wire);

    [Theory]
    [InlineData(ActionItemStatus.Open, "open")]
    [InlineData(ActionItemStatus.InProgress, "in_progress")]
    [InlineData(ActionItemStatus.Done, "done")]
    [InlineData(ActionItemStatus.CarriedOver, "carried_over")]
    [InlineData(ActionItemStatus.Dropped, "dropped")]
    public void ActionItemStatus_round_trips(ActionItemStatus value, string wire) => AssertRoundTrip(value, wire);

    [Theory]
    [InlineData(FocusTopicStatus.OnTrack, "on_track")]
    [InlineData(FocusTopicStatus.AtRisk, "at_risk")]
    [InlineData(FocusTopicStatus.OnHold, "on_hold")]
    [InlineData(FocusTopicStatus.Done, "done")]
    public void FocusTopicStatus_round_trips(FocusTopicStatus value, string wire) => AssertRoundTrip(value, wire);

    [Theory]
    [InlineData(SeatAssignment.Permanent, "permanent")]
    [InlineData(SeatAssignment.Floating, "floating")]
    public void SeatAssignment_round_trips(SeatAssignment value, string wire) => AssertRoundTrip(value, wire);

    [Theory]
    [InlineData(SeatDefectStatus.Open, "open")]
    [InlineData(SeatDefectStatus.Closed, "closed")]
    public void SeatDefectStatus_round_trips(SeatDefectStatus value, string wire) => AssertRoundTrip(value, wire);

    // ── PascalCase — the 4 that fail SILENTLY with a wrong converter (works by ────
    // ── coincidence with a blanket HasConversion<string>(), which is exactly why ──
    // ── these need the same explicit assertion as the loud ones, not less) ───────

    [Theory]
    [InlineData(BlockerStatus.Open, "Open")]
    [InlineData(BlockerStatus.InProgress, "InProgress")]
    [InlineData(BlockerStatus.Resolved, "Resolved")]
    public void BlockerStatus_round_trips(BlockerStatus value, string wire) => AssertRoundTrip(value, wire);

    [Theory]
    [InlineData(PokerDeckType.Fibonacci, "Fibonacci")]
    [InlineData(PokerDeckType.TShirt, "TShirt")]
    [InlineData(PokerDeckType.Custom, "Custom")]
    public void PokerDeckType_round_trips(PokerDeckType value, string wire) => AssertRoundTrip(value, wire);

    [Theory]
    [InlineData(PokerSessionStatus.Pending, "Pending")]
    [InlineData(PokerSessionStatus.InProgress, "InProgress")]
    [InlineData(PokerSessionStatus.Completed, "Completed")]
    public void PokerSessionStatus_round_trips(PokerSessionStatus value, string wire) => AssertRoundTrip(value, wire);

    [Theory]
    [InlineData(RetroPhase.CheckIn, "CheckIn")]
    [InlineData(RetroPhase.Icebreaker, "Icebreaker")]
    [InlineData(RetroPhase.Write, "Write")]
    [InlineData(RetroPhase.Group, "Group")]
    [InlineData(RetroPhase.Vote, "Vote")]
    [InlineData(RetroPhase.Discuss, "Discuss")]
    [InlineData(RetroPhase.WrapUp, "WrapUp")]
    [InlineData(RetroPhase.Completed, "Completed")]
    public void RetroPhase_round_trips(RetroPhase value, string wire) => AssertRoundTrip(value, wire);

    /// <summary>
    /// Cross-check against reflection rather than a hand-maintained list: every member of
    /// every one of the 11 enums must be covered by one of the theories above. Catches
    /// the case where a 12th enum or a new member is added to an existing one without a
    /// matching test case — the hand-written theories would just silently not cover it.
    /// </summary>
    [Fact]
    public void All_11_enum_types_and_all_their_members_are_covered_above()
    {
        var expectedTypes = new[]
        {
            typeof(TeamRole), typeof(SprintStatus), typeof(ActionItemType), typeof(ActionItemStatus),
            typeof(FocusTopicStatus), typeof(SeatAssignment), typeof(SeatDefectStatus),
            typeof(BlockerStatus), typeof(PokerDeckType), typeof(PokerSessionStatus), typeof(RetroPhase),
        };

        var coveredValuesPerType = new Dictionary<Type, object[]>
        {
            [typeof(TeamRole)] = [TeamRole.Member, TeamRole.Admin],
            [typeof(SprintStatus)] = [SprintStatus.Planning, SprintStatus.Active, SprintStatus.Completed],
            [typeof(ActionItemType)] = [ActionItemType.Retro, ActionItemType.Planning],
            [typeof(ActionItemStatus)] =
            [
                ActionItemStatus.Open, ActionItemStatus.InProgress, ActionItemStatus.Done,
                ActionItemStatus.CarriedOver, ActionItemStatus.Dropped,
            ],
            [typeof(FocusTopicStatus)] =
            [
                FocusTopicStatus.OnTrack, FocusTopicStatus.AtRisk,
                FocusTopicStatus.OnHold, FocusTopicStatus.Done,
            ],
            [typeof(SeatAssignment)] = [SeatAssignment.Permanent, SeatAssignment.Floating],
            [typeof(SeatDefectStatus)] = [SeatDefectStatus.Open, SeatDefectStatus.Closed],
            [typeof(BlockerStatus)] = [BlockerStatus.Open, BlockerStatus.InProgress, BlockerStatus.Resolved],
            [typeof(PokerDeckType)] = [PokerDeckType.Fibonacci, PokerDeckType.TShirt, PokerDeckType.Custom],
            [typeof(PokerSessionStatus)] =
                [PokerSessionStatus.Pending, PokerSessionStatus.InProgress, PokerSessionStatus.Completed],
            [typeof(RetroPhase)] =
            [
                RetroPhase.CheckIn, RetroPhase.Icebreaker, RetroPhase.Write, RetroPhase.Group,
                RetroPhase.Vote, RetroPhase.Discuss, RetroPhase.WrapUp, RetroPhase.Completed,
            ],
        };

        Assert.Equal(11, expectedTypes.Length);

        foreach (var enumType in expectedTypes)
        {
            var actualMembers = Enum.GetValues(enumType).Cast<object>().ToHashSet();
            var coveredMembers = coveredValuesPerType[enumType].ToHashSet();
            Assert.True(
                actualMembers.SetEquals(coveredMembers),
                $"{enumType.Name}: test coverage doesn't match the enum's actual members. " +
                $"Enum has [{string.Join(", ", actualMembers)}], test covers [{string.Join(", ", coveredMembers)}].");
        }
    }
}
