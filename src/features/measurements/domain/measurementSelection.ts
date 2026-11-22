export interface SelectedMeasurementItem {
  savedId: number | null;
  unsavedId: string | null;
  length: number;
  kind: "distance" | "area";
  title?: string;
}

/** Returns the canonical session-link key (`saved:<id>` or `<unsavedId>`) for a measurement item. */
export function toMeasurementLinkKey(
  item: Pick<SelectedMeasurementItem, "savedId" | "unsavedId">,
): string | null {
  if (item.savedId !== null) return `saved:${item.savedId}`;
  return item.unsavedId ?? null;
}

/** Parses a canonical session-link key back into `{ savedId, unsavedId }`. */
export function parseMeasurementLinkKey(
  key: string,
): { savedId: number | null; unsavedId: string | null } | null {
  if (!key) return null;
  if (key.startsWith("saved:")) {
    const id = Number(key.slice(6));
    return Number.isFinite(id) ? { savedId: id, unsavedId: null } : null;
  }
  return { savedId: null, unsavedId: key };
}

/** Checks whether two measurement selection items refer to the same feature. */
export function isSameMeasurementItem(
  a: Pick<SelectedMeasurementItem, "savedId" | "unsavedId">,
  b: Pick<SelectedMeasurementItem, "savedId" | "unsavedId">,
): boolean {
  if (a.savedId !== null || b.savedId !== null) {
    return a.savedId !== null && b.savedId !== null && a.savedId === b.savedId;
  }
  return a.unsavedId !== null && b.unsavedId !== null && a.unsavedId === b.unsavedId;
}

/** Toggles a measurement item in or out of a multi-selection list, returning the updated list. */
export function toggleMeasurementInSelection(
  current: SelectedMeasurementItem[],
  target: SelectedMeasurementItem,
): SelectedMeasurementItem[] {
  const exists = current.some((item) => isSameMeasurementItem(item, target));
  if (exists) {
    return current.filter((item) => !isSameMeasurementItem(item, target));
  }
  return [...current, target];
}

/** Updates the length/kind of a matching measurement inside the selection list. */
export function updateMeasurementItemInSelection(
  current: SelectedMeasurementItem[],
  updated: SelectedMeasurementItem,
): SelectedMeasurementItem[] {
  let found = false;
  const next = current.map((item) => {
    if (!isSameMeasurementItem(item, updated)) return item;
    found = true;
    return { ...item, ...updated };
  });
  return found ? next : [updated];
}

/** Merges additional measurements into `current`, preserving order and avoiding duplicates. */
export function mergeMeasurementSelection(
  current: SelectedMeasurementItem[],
  additions: SelectedMeasurementItem[],
): SelectedMeasurementItem[] {
  let next = current;
  for (const item of additions) {
    if (!next.some((existing) => isSameMeasurementItem(existing, item))) {
      if (next === current) next = [...current];
      next.push(item);
    }
  }
  return next;
}

/** Adds a bidirectional session link between two unsaved measurement IDs. */
export function addMeasurementLink(
  links: Record<string, string[]>,
  idA: string,
  idB: string,
): Record<string, string[]> {
  if (!idA || !idB || idA === idB) return links;
  const neighborsA = links[idA] ?? [];
  const neighborsB = links[idB] ?? [];
  return {
    ...links,
    [idA]: neighborsA.includes(idB) ? neighborsA : [...neighborsA, idB],
    [idB]: neighborsB.includes(idA) ? neighborsB : [...neighborsB, idA],
  };
}

/** Removes an unsaved measurement ID from all session link adjacency lists. */
export function removeMeasurementFromLinks(
  links: Record<string, string[]>,
  targetId: string,
): Record<string, string[]> {
  if (!links[targetId]) return links;
  const next: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(links)) {
    if (key === targetId) continue;
    const filtered = list.filter((id) => id !== targetId);
    if (filtered.length > 0) next[key] = filtered;
  }
  return next;
}

/** Collects all unsaved measurement IDs in the connected link component starting at `startId`. */
export function getLinkedMeasurementGroup(
  links: Record<string, string[]>,
  startId: string | null,
): string[] {
  if (!startId) return [];
  const neighbors = links[startId];
  if (!neighbors || neighbors.length === 0) return [startId];
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const next of links[curr] ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return Array.from(visited);
}
