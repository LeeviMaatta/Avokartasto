import type { LayerGroup, LayerListItem } from "../model/layerListTypes";

export type LayerSectionEntry =
  | { type: "group"; group: LayerGroup; layers: LayerListItem[] }
  | { type: "layer"; layer: LayerListItem };

export function buildLayerSectionEntries(
  items: LayerListItem[],
  groups: LayerGroup[],
  layerGroupMap: Record<string, string>,
): LayerSectionEntry[] {
  const activeGroupMap = new Map(groups.filter((grp) => !grp.hidden).map((grp) => [grp.id, grp]));
  const renderedGroupIds = new Set<string>();
  const entries: LayerSectionEntry[] = [];

  for (const item of items) {
    const gid = layerGroupMap[item.id];
    const grp = gid ? activeGroupMap.get(gid) : undefined;
    if (grp) {
      if (!renderedGroupIds.has(grp.id)) {
        renderedGroupIds.add(grp.id);
        entries.push({
          type: "group",
          group: grp,
          layers: items.filter((l) => layerGroupMap[l.id] === grp.id),
        });
      }
    } else {
      entries.push({ type: "layer", layer: item });
    }
  }

  return entries;
}
