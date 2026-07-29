using Backend.Models;

namespace Backend.Data;

public static class IcebreakerSeeds
{
    public static readonly Icebreaker[] All =
    [
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000001"), Text = "What's one thing you're looking forward to this week?", Category = "quick" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000002"), Text = "If you could have any superpower for just today, what would it be?", Category = "fun" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000003"), Text = "What's the best piece of advice you've ever received?", Category = "team-building" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000004"), Text = "What's a skill you've picked up in the last year that surprised you?", Category = "team-building" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000005"), Text = "If your current project was a movie, what genre would it be?", Category = "retro" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000006"), Text = "What emoji best describes how you're feeling right now?", Category = "quick" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000007"), Text = "What's one thing outside of work you've been enjoying lately?", Category = "fun" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000008"), Text = "What's your go-to strategy when you're stuck on a hard problem?", Category = "team-building" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000009"), Text = "If the sprint was a road trip, where did we end up vs. where we planned to go?", Category = "retro" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000010"), Text = "What's one word that describes last sprint?", Category = "retro" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000011"), Text = "What's a tool or shortcut you've discovered recently that saves you time?", Category = "team-building" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000012"), Text = "What's the most interesting thing you've learned in the last two weeks?", Category = "team-building" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000013"), Text = "If you could change one thing about how the team communicates, what would it be?", Category = "retro" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000014"), Text = "What's something small that made your day better recently?", Category = "fun" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000015"), Text = "If you had a theme song that played when you entered a room, what would it be?", Category = "fun" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000016"), Text = "What's the most challenging part of remote/hybrid work for you?", Category = "team-building" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000017"), Text = "What's a technical concept you wish you had learned earlier in your career?", Category = "team-building" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000018"), Text = "What's the last thing that made you laugh out loud?", Category = "fun" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000019"), Text = "If the team was a band, what instrument would each person play?", Category = "fun" },
        new() { Id = new Guid("a1000001-0000-0000-0000-000000000020"), Text = "What's one habit you're trying to build or break right now?", Category = "quick" },
    ];
}
