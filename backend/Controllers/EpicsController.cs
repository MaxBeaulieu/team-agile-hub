using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using static Postgrest.Constants;
using System.Security.Claims;

namespace Backend.Controllers;

[ApiController]
[Authorize]
public class EpicsController(SupabaseService sb) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    private async Task<bool> IsMember(Guid teamId)
    {
        var r = await sb.Db.From<TeamMember>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("user_id", Operator.Equals, CurrentUserId.ToString())
            .Get();
        return r.Models.Any();
    }

    // ─── Epics ───────────────────────────────────────────────────────────────

    // GET api/teams/{teamId}/epics
    [HttpGet("api/teams/{teamId:guid}/epics")]
    public async Task<IActionResult> GetEpics(Guid teamId)
    {
        if (!await IsMember(teamId)) return Forbid();

        var result = await sb.Db.From<Epic>()
            .Select("*, epic_kpis(*)")
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Order("created_at", Ordering.Ascending)
            .Get();

        return Ok(result.Models);
    }

    // POST api/teams/{teamId}/epics
    [HttpPost("api/teams/{teamId:guid}/epics")]
    public async Task<IActionResult> CreateEpic(Guid teamId, [FromBody] CreateEpicRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest("Title is required.");

        var epic = new Epic
        {
            TeamId           = teamId,
            Title            = req.Title.Trim(),
            Description      = req.Description?.Trim(),
            Status           = req.Status ?? EpicStatus.OnTrack,
            ExpectedDelivery = req.ExpectedDelivery,
        };

        var inserted = (await sb.Db.From<Epic>().Insert(epic)).Models.First();
        return Ok(inserted);
    }

    // PATCH api/teams/{teamId}/epics/{id}
    [HttpPatch("api/teams/{teamId:guid}/epics/{id:guid}")]
    public async Task<IActionResult> UpdateEpic(Guid teamId, Guid id, [FromBody] JObject body)
    {
        if (!await IsMember(teamId)) return Forbid();

        var epic = (await sb.Db.From<Epic>()
            .Filter("id",      Operator.Equals, id.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();
        if (epic is null) return NotFound();

        if (body.TryGetValue("title", StringComparison.OrdinalIgnoreCase, out var t)
            && t.Type != JTokenType.Null)
            epic.Title = t.Value<string>()!.Trim();

        if (body.TryGetValue("description", StringComparison.OrdinalIgnoreCase, out var d))
            epic.Description = d.Type == JTokenType.Null ? null : d.Value<string>()?.Trim();

        if (body.TryGetValue("status", StringComparison.OrdinalIgnoreCase, out var st)
            && st.Type != JTokenType.Null)
            try { epic.Status = st.ToObject<EpicStatus>(); } catch { /* ignore invalid value */ }

        if (body.TryGetValue("expectedDelivery", StringComparison.OrdinalIgnoreCase, out var ed))
            epic.ExpectedDelivery = ed.Type == JTokenType.Null ? null : DateOnly.Parse(ed.Value<string>()!);

        await sb.Db.From<Epic>().Update(epic);
        return Ok(epic);
    }

    // DELETE api/teams/{teamId}/epics/{id}
    [HttpDelete("api/teams/{teamId:guid}/epics/{id:guid}")]
    public async Task<IActionResult> DeleteEpic(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var epic = (await sb.Db.From<Epic>()
            .Filter("id",      Operator.Equals, id.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();
        if (epic is null) return NotFound();

        await sb.Db.From<Epic>().Filter("id", Operator.Equals, id.ToString()).Delete();
        return NoContent();
    }

    // ─── Epic KPIs / Success Criteria ────────────────────────────────────────

    // POST api/teams/{teamId}/epics/{epicId}/kpis
    [HttpPost("api/teams/{teamId:guid}/epics/{epicId:guid}/kpis")]
    public async Task<IActionResult> AddKpi(Guid teamId, Guid epicId, [FromBody] KpiRequest req)
    {
        if (!await IsMember(teamId)) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Label)) return BadRequest("Label is required.");

        var existing = (await sb.Db.From<EpicKpi>()
            .Filter("epic_id", Operator.Equals, epicId.ToString()).Get()).Models;
        var order = existing.Any() ? existing.Max(k => k.Order) + 1 : 0;

        var kpi = new EpicKpi
        {
            EpicId       = epicId,
            Label        = req.Label.Trim(),
            TargetValue  = req.TargetValue?.Trim(),
            CurrentValue = req.CurrentValue?.Trim(),
            IsDone       = false,
            Order        = order,
        };

        var inserted = (await sb.Db.From<EpicKpi>().Insert(kpi)).Models.First();
        return Ok(inserted);
    }

    // PATCH api/teams/{teamId}/kpis/{id}
    [HttpPatch("api/teams/{teamId:guid}/kpis/{id:guid}")]
    public async Task<IActionResult> UpdateKpi(Guid teamId, Guid id, [FromBody] JObject body)
    {
        if (!await IsMember(teamId)) return Forbid();

        var kpi = (await sb.Db.From<EpicKpi>()
            .Filter("id", Operator.Equals, id.ToString()).Get()).Models.FirstOrDefault();
        if (kpi is null) return NotFound();

        // Verify parent epic belongs to this team
        var epic = (await sb.Db.From<Epic>()
            .Filter("id",      Operator.Equals, kpi.EpicId.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();
        if (epic is null) return Forbid();

        if (body.TryGetValue("label", StringComparison.OrdinalIgnoreCase, out var l)
            && l.Type != JTokenType.Null)
            kpi.Label = l.Value<string>()!.Trim();

        if (body.TryGetValue("targetValue", StringComparison.OrdinalIgnoreCase, out var tv))
            kpi.TargetValue = tv.Type == JTokenType.Null ? null : tv.Value<string>()?.Trim();

        if (body.TryGetValue("currentValue", StringComparison.OrdinalIgnoreCase, out var cv))
            kpi.CurrentValue = cv.Type == JTokenType.Null ? null : cv.Value<string>()?.Trim();

        if (body.TryGetValue("isDone", StringComparison.OrdinalIgnoreCase, out var done))
            kpi.IsDone = done.Value<bool>();

        await sb.Db.From<EpicKpi>().Update(kpi);
        return Ok(kpi);
    }

    // DELETE api/teams/{teamId}/kpis/{id}
    [HttpDelete("api/teams/{teamId:guid}/kpis/{id:guid}")]
    public async Task<IActionResult> DeleteKpi(Guid teamId, Guid id)
    {
        if (!await IsMember(teamId)) return Forbid();

        var kpi = (await sb.Db.From<EpicKpi>()
            .Filter("id", Operator.Equals, id.ToString()).Get()).Models.FirstOrDefault();
        if (kpi is null) return NotFound();

        var epic = (await sb.Db.From<Epic>()
            .Filter("id",      Operator.Equals, kpi.EpicId.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Get()).Models.FirstOrDefault();
        if (epic is null) return Forbid();

        await sb.Db.From<EpicKpi>().Filter("id", Operator.Equals, id.ToString()).Delete();
        return NoContent();
    }
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────
public record CreateEpicRequest(string Title, string? Description, EpicStatus? Status, DateOnly? ExpectedDelivery);
public record KpiRequest(string Label, string? TargetValue, string? CurrentValue);
