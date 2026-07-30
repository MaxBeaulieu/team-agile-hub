"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export type RetroTemplate = {
  id: string;
  name: string;
  columnsJson: string;
  isBuiltin: boolean;
  createdBy: string | null;
  createdAt: string;
};

export const MAX_TEMPLATE_COLUMNS = 8;

export function parseColumns(csv: string): string[] {
  return csv
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function templateColumns(template: RetroTemplate): string[] {
  try {
    const parsed: unknown = JSON.parse(template.columnsJson);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Columns field for the "start a retro" dialogs, with the shared template
 * library on top (EE-161). Templates are global: everyone sees the built-ins
 * plus every template saved by any user, but only the author can edit or
 * delete their own.
 *
 * `value` is the comma-separated column string the parent dialog already owns.
 */
export function ColumnTemplatePicker({
  value,
  onChange,
}: Readonly<{
  value: string;
  onChange: (next: string) => void;
}>) {
  const [templates, setTemplates] = useState<RetroTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);

  // id of the template being renamed, or "new" while saving the current columns
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const load = useCallback(async () => {
    try {
      setTemplates(await api.get<RetroTemplate[]>("/api/retro-templates"));
    } catch {
      toast.error("Failed to load retro templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) setUserId(user.id);
      });
    load();
  }, [load]);

  const columns = parseColumns(value);

  function apply(template: RetroTemplate) {
    onChange(templateColumns(template).join(", "));
  }

  function startEdit(template: RetroTemplate) {
    setEditingId(template.id);
    setDraftName(template.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftName("");
  }

  async function saveNew() {
    if (columns.length === 0) {
      toast.error("Add at least one column first");
      return;
    }
    if (columns.length > MAX_TEMPLATE_COLUMNS) {
      toast.error(
        `A template can have at most ${MAX_TEMPLATE_COLUMNS} columns`,
      );
      return;
    }
    const name = draftName.trim();
    if (!name) {
      toast.error("Template name is required");
      return;
    }

    setSaving(true);
    try {
      await api.post<RetroTemplate>("/api/retro-templates", { name, columns });
      cancelEdit();
      await load();
      toast.success("Template saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save template",
      );
    } finally {
      setSaving(false);
    }
  }

  async function rename(template: RetroTemplate) {
    const name = draftName.trim();
    if (!name) {
      toast.error("Template name is required");
      return;
    }

    setSaving(true);
    try {
      await api.patch<RetroTemplate>(`/api/retro-templates/${template.id}`, {
        name,
        columns: templateColumns(template),
      });
      cancelEdit();
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update template",
      );
    } finally {
      setSaving(false);
    }
  }

  async function overwrite(template: RetroTemplate) {
    if (columns.length === 0) {
      toast.error("Add at least one column first");
      return;
    }

    setSaving(true);
    try {
      await api.patch<RetroTemplate>(`/api/retro-templates/${template.id}`, {
        name: template.name,
        columns,
      });
      await load();
      toast.success(`Updated "${template.name}"`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update template",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(template: RetroTemplate) {
    setSaving(true);
    try {
      await api.delete(`/api/retro-templates/${template.id}`);
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete template",
      );
    } finally {
      setSaving(false);
    }
  }

  const isMine = (t: RetroTemplate) => !t.isBuiltin && t.createdBy === userId;
  const activeId = templates.find(
    (t) => templateColumns(t).join(", ") === columns.join(", "),
  )?.id;

  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        <label
          htmlFor="retro-columns"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Columns (comma-separated)
        </label>
        <input
          id="retro-columns"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Templates
        </p>

        {loading ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {templates.map((template) =>
              editingId === template.id ? (
                <span
                  key={template.id}
                  className="inline-flex items-center gap-1 rounded-full border border-primary bg-background px-2 py-0.5"
                >
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename(template);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                    maxLength={60}
                    className="w-28 bg-transparent text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => rename(template)}
                    disabled={saving}
                    aria-label="Save template name"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Check className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    aria-label="Cancel"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ) : (
                <span
                  key={template.id}
                  className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    activeId === template.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent/50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => apply(template)}
                    title={templateColumns(template).join(" · ")}
                    className="cursor-pointer"
                  >
                    {template.name}
                  </button>

                  {isMine(template) && (
                    <>
                      <button
                        type="button"
                        onClick={() => overwrite(template)}
                        disabled={saving}
                        title="Overwrite with the columns above"
                        aria-label={`Overwrite ${template.name}`}
                        className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                      >
                        <Check className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(template)}
                        disabled={saving}
                        aria-label={`Rename ${template.name}`}
                        className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(template)}
                        disabled={saving}
                        aria-label={`Delete ${template.name}`}
                        className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </>
                  )}
                </span>
              ),
            )}

            {editingId === "new" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary bg-background px-2 py-0.5">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveNew();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  placeholder="Template name"
                  autoFocus
                  maxLength={60}
                  className="w-28 bg-transparent text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={saveNew}
                  disabled={saving}
                  aria-label="Save template"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {saving ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  aria-label="Cancel"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingId("new");
                  setDraftName("");
                }}
                className="h-[22px] gap-1 rounded-full px-2 text-xs"
              >
                <Plus className="size-3" />
                Save current
              </Button>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Templates are shared with everyone. You can only edit the ones you
          created.
        </p>
      </div>
    </div>
  );
}
