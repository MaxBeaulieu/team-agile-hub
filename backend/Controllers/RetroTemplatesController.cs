using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using static Postgrest.Constants;
using System.Security.Claims;

namespace Backend.Controllers;

/// <summary>
/// Shared library of retro column sets (EE-161). Templates are global: any
/// authenticated user can list them and use them when starting a retro.
/// Editing is limited to the author; built-ins are read-only.
/// </summary>
[ApiController]
[Authorize]
[Route("api/retro-templates")]
public class RetroTemplatesController(SupabaseService sb) : ControllerBase
{
    private const int MaxColumns    = 8;
    private const int MaxNameLength = 60;

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")!);

    // Templates are shared, so anything a user types here is read back by every
    // other user. Keep the payload to a bounded list of short plain strings.
    private static (string? error, string? name, string? columnsJson) Validate(
        string? name, List<string>? columns)
    {
        var trimmedName = name?.Trim();
        if (string.IsNullOrWhiteSpace(trimmedName))
            return ("Template name is required.", null, null);
        if (trimmedName.Length > MaxNameLength)
            return ($"Template name must be {MaxNameLength} characters or fewer.", null, null);

        var cleaned = (columns ?? [])
            .Select(c => c?.Trim() ?? string.Empty)
            .Where(c => c.Length > 0)
            .ToList();

        if (cleaned.Count == 0)
            return ("At least one column is required.", null, null);
        if (cleaned.Count > MaxColumns)
            return ($"A template can have at most {MaxColumns} columns.", null, null);
        if (cleaned.Any(c => c.Length > MaxNameLength))
            return ($"Column names must be {MaxNameLength} characters or fewer.", null, null);

        return (null, trimmedName, JsonConvert.SerializeObject(cleaned));
    }

    // GET api/retro-templates
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var templates = (await sb.Db.From<RetroTemplate>()
            .Order("created_at", Ordering.Ascending)
            .Get()).Models;

        // Built-ins first, then the shared user-created ones.
        return Ok(templates
            .OrderByDescending(t => t.IsBuiltin)
            .ThenBy(t => t.CreatedAt));
    }

    // POST api/retro-templates
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveTemplateRequest req)
    {
        var (error, name, columnsJson) = Validate(req.Name, req.Columns);
        if (error is not null) return BadRequest(error);

        var template = new RetroTemplate
        {
            Name        = name!,
            ColumnsJson = columnsJson!,
            IsBuiltin   = false,
            CreatedBy   = CurrentUserId,
        };

        var created = (await sb.Db.From<RetroTemplate>().Insert(template)).Models.First();
        return Ok(created);
    }

    // PATCH api/retro-templates/{id}
    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] SaveTemplateRequest req)
    {
        var template = (await sb.Db.From<RetroTemplate>()
            .Filter("id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (template is null) return NotFound();

        if (template.IsBuiltin) return Forbid();
        if (template.CreatedBy != CurrentUserId) return Forbid();

        var (error, name, columnsJson) = Validate(req.Name, req.Columns);
        if (error is not null) return BadRequest(error);

        template.Name        = name!;
        template.ColumnsJson = columnsJson!;

        await sb.Db.From<RetroTemplate>().Update(template);
        return Ok(template);
    }

    // DELETE api/retro-templates/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var template = (await sb.Db.From<RetroTemplate>()
            .Filter("id", Operator.Equals, id.ToString())
            .Get()).Models.FirstOrDefault();
        if (template is null) return NotFound();

        if (template.IsBuiltin) return Forbid();
        if (template.CreatedBy != CurrentUserId) return Forbid();

        await sb.Db.From<RetroTemplate>()
            .Filter("id", Operator.Equals, id.ToString())
            .Delete();

        return NoContent();
    }
}

public record SaveTemplateRequest(string? Name, List<string>? Columns);
