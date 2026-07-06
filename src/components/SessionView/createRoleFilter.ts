import { useMemo, useState } from "react";
import type { TimelineEntry } from "../../features/session/timeline/types";
import type { MessageRole } from "../../lib/types";

export interface CreateRoleFilterResult {
  /** Currently hidden roles. */
  hiddenRoles: Set<MessageRole>;
  /** Per-role message counts for the filter toolbar. */
  roleCounts: Record<string, number>;
  /** Entries with hidden roles removed. */
  filteredEntries: TimelineEntry[];
  /** Toggle a role's visibility. */
  toggleRole: (role: MessageRole) => void;
}

/** Filter-toolbar role bucket for a timeline item. Thinking and system
 * markers both surface under "system", mirroring their source role; unknown
 * items are never filterable — they must stay visible. */
function roleOf(entry: TimelineEntry): MessageRole | null {
  switch (entry.item.kind) {
    case "user":
      return "user";
    case "assistantText":
      return "assistant";
    case "toolStep":
      return "tool";
    case "thinking":
    case "systemMarker":
      return "system";
    case "unknown":
      return null;
  }
}

/**
 * Owns the role-filter slice of SessionView: the `hiddenRoles` set plus the
 * derived `filteredEntries` and `roleCounts` memos.
 */
export function useRoleFilter(
  entries: TimelineEntry[],
): CreateRoleFilterResult {
  const [hiddenRoles, setHiddenRoles] = useState<Set<MessageRole>>(new Set());

  const filteredEntries = useMemo(() => {
    if (hiddenRoles.size === 0) return entries;
    return entries.filter((entry) => {
      const role = roleOf(entry);
      return role === null || !hiddenRoles.has(role);
    });
  }, [entries, hiddenRoles]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {
      user: 0,
      assistant: 0,
      tool: 0,
      system: 0,
    };
    for (const entry of entries) {
      const role = roleOf(entry);
      if (role !== null) counts[role] += 1;
    }
    return counts;
  }, [entries]);

  function toggleRole(role: MessageRole) {
    setHiddenRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  return { hiddenRoles, roleCounts, filteredEntries, toggleRole };
}
