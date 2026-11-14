import { useEffect, useState, type PointerEvent } from "react";
import { useMapStore } from "../../../store/mapStore";
import { requestConfirmation } from "../../../app/confirmation";
import type { LayerGroup } from "../model/layerListTypes";

interface UseLayerGroupsAndDragOptions {
  settings: Record<string, string>;
  overlayOrder: string[];
  basemapOrder: string[];
  setLayerOrder: (kind: "overlay" | "basemap", ids: string[]) => void;
  hideLayers: (ids: string[]) => void;
  unhideLayers: (ids: string[]) => void;
  onCloseMenus: () => void;
}

export function useLayerGroupsAndDrag({
  settings,
  overlayOrder,
  basemapOrder,
  setLayerOrder,
  hideLayers,
  unhideLayers,
  onCloseMenus,
}: UseLayerGroupsAndDragOptions) {
  const [groups, setGroups] = useState<LayerGroup[]>([]);
  const [layerGroupMap, setLayerGroupMap] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState<{ kind: "overlay" | "basemap"; id: string } | null>(null);
  const [draggingGroup, setDraggingGroup] = useState<{ role: "overlay" | "basemap"; id: string } | null>(null);

  useEffect(() => {
    try {
      const parsedGroups = JSON.parse(settings.layerGroups ?? "[]") as LayerGroup[];
      setGroups(Array.isArray(parsedGroups) ? parsedGroups.filter((g) => g && typeof g.id === "string" && typeof g.name === "string") : []);
    } catch {
      setGroups([]);
    }
    try {
      const parsedMap = JSON.parse(settings.layerGroupMap ?? "{}") as Record<string, string>;
      setLayerGroupMap(parsedMap && typeof parsedMap === "object" ? parsedMap : {});
    } catch {
      setLayerGroupMap({});
    }
  }, [settings.layerGroups, settings.layerGroupMap]);

  useEffect(() => {
    const stopDragging = () => {
      setDragging(null);
      setDraggingGroup(null);
    };
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  const setLayerGroup = (layerId: string, groupId: string | null) => {
    const nextMap = { ...layerGroupMap };
    if (!groupId) {
      delete nextMap[layerId];
    } else {
      nextMap[layerId] = groupId;
    }
    setLayerGroupMap(nextMap);
    void useMapStore.getState().setSetting("layerGroupMap", JSON.stringify(nextMap));
    onCloseMenus();
  };

  const createGroup = (name: string, assignLayerId?: string, role?: "basemap" | "overlay") => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newGroup: LayerGroup = { id: `grp-${Date.now()}`, name: trimmed, ...(role ? { role } : {}) };
    const nextGroups = [...groups, newGroup];
    setGroups(nextGroups);
    void useMapStore.getState().setSetting("layerGroups", JSON.stringify(nextGroups));
    if (assignLayerId) {
      const nextMap = { ...layerGroupMap, [assignLayerId]: newGroup.id };
      setLayerGroupMap(nextMap);
      void useMapStore.getState().setSetting("layerGroupMap", JSON.stringify(nextMap));
    }
    onCloseMenus();
  };

  const hideGroup = (groupId: string) => {
    const layerIdsInGroup = Object.keys(layerGroupMap).filter((id) => layerGroupMap[id] === groupId);
    const nextGroups = groups.map((g) => (g.id === groupId ? { ...g, hidden: true } : g));
    setGroups(nextGroups);
    void useMapStore.getState().setSetting("layerGroups", JSON.stringify(nextGroups));
    if (layerIdsInGroup.length > 0) {
      hideLayers(layerIdsInGroup);
    }
    onCloseMenus();
  };

  const restoreGroup = (groupId: string) => {
    const layerIdsInGroup = Object.keys(layerGroupMap).filter((id) => layerGroupMap[id] === groupId);
    const nextGroups = groups.map((g) => (g.id === groupId ? { id: g.id, name: g.name, ...(g.role ? { role: g.role } : {}) } : g));
    setGroups(nextGroups);
    void useMapStore.getState().setSetting("layerGroups", JSON.stringify(nextGroups));
    if (layerIdsInGroup.length > 0) {
      unhideLayers(layerIdsInGroup);
    }
  };

  const deleteGroup = async (groupId: string) => {
    const target = groups.find((g) => g.id === groupId);
    if (!target) return;
    onCloseMenus();
    const layerIdsInGroup = Object.keys(layerGroupMap).filter((id) => layerGroupMap[id] === groupId);
    const confirmMsg = layerIdsInGroup.length > 0
      ? `Haluatko varmasti poistaa ryhmän "${target.name}"? Ryhmän sisällä olevat tasot (${layerIdsInGroup.length} kpl) piilotetaan.`
      : `Haluatko varmasti poistaa ryhmän "${target.name}"?`;
    if (await requestConfirmation(confirmMsg)) {
      const nextGroups = groups.filter((g) => g.id !== groupId);
      setGroups(nextGroups);
      void useMapStore.getState().setSetting("layerGroups", JSON.stringify(nextGroups));
      const nextMap = { ...layerGroupMap };
      layerIdsInGroup.forEach((id) => {
        delete nextMap[id];
      });
      setLayerGroupMap(nextMap);
      void useMapStore.getState().setSetting("layerGroupMap", JSON.stringify(nextMap));
      if (layerIdsInGroup.length > 0) {
        hideLayers(layerIdsInGroup);
      }
    }
  };

  const beginDrag = (event: PointerEvent, kind: "overlay" | "basemap", id: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging({ kind, id });
  };

  const moveDraggedLayer = (kind: "overlay" | "basemap", targetId: string, ids: string[]) => {
    if (!dragging || dragging.kind !== kind || dragging.id === targetId) return;
    const order = [...ids];
    const from = order.indexOf(dragging.id);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, dragging.id);
    setLayerOrder(kind, order);
  };

  const beginDragGroup = (event: PointerEvent, role: "overlay" | "basemap", groupId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingGroup({ role, id: groupId });
  };

  const applyLayerOrderPreservingHidden = (role: "overlay" | "basemap", visibleOrder: string[]) => {
    const existing = role === "overlay" ? overlayOrder : basemapOrder;
    const visibleSet = new Set(visibleOrder);
    const hiddenRest = existing.filter((id) => !visibleSet.has(id));
    setLayerOrder(role, [...visibleOrder, ...hiddenRest]);
  };

  const moveDraggedGroup = (role: "overlay" | "basemap", targetGroupId: string, ids: string[]) => {
    if (!draggingGroup || draggingGroup.role !== role || draggingGroup.id === targetGroupId) return;
    const groupLayers = ids.filter((id) => layerGroupMap[id] === draggingGroup.id);
    const targetLayers = ids.filter((id) => layerGroupMap[id] === targetGroupId);
    if (groupLayers.length === 0 || targetLayers.length === 0) return;

    const fromFirst = ids.indexOf(groupLayers[0]);
    const targetFirst = ids.indexOf(targetLayers[0]);
    const groupSet = new Set(groupLayers);
    const remaining = ids.filter((id) => !groupSet.has(id));

    if (fromFirst < targetFirst) {
      const targetLastIdx = remaining.lastIndexOf(targetLayers[targetLayers.length - 1]);
      remaining.splice(targetLastIdx + 1, 0, ...groupLayers);
    } else {
      const targetFirstIdx = remaining.indexOf(targetLayers[0]);
      remaining.splice(targetFirstIdx, 0, ...groupLayers);
    }
    applyLayerOrderPreservingHidden(role, remaining);
  };

  const moveDraggedGroupOverLayer = (role: "overlay" | "basemap", targetLayerId: string, ids: string[]) => {
    if (!draggingGroup || draggingGroup.role !== role) return;
    if (layerGroupMap[targetLayerId] === draggingGroup.id) return;
    const groupLayers = ids.filter((id) => layerGroupMap[id] === draggingGroup.id);
    if (groupLayers.length === 0) return;

    const fromFirst = ids.indexOf(groupLayers[0]);
    const targetIdx = ids.indexOf(targetLayerId);
    if (targetIdx < 0) return;

    const groupSet = new Set(groupLayers);
    const remaining = ids.filter((id) => !groupSet.has(id));
    const targetInRemaining = remaining.indexOf(targetLayerId);
    if (targetInRemaining < 0) return;

    if (fromFirst < targetIdx) {
      remaining.splice(targetInRemaining + 1, 0, ...groupLayers);
    } else {
      remaining.splice(targetInRemaining, 0, ...groupLayers);
    }
    applyLayerOrderPreservingHidden(role, remaining);
  };

  const moveLayerOverGroup = (role: "overlay" | "basemap", targetGroupId: string, ids: string[]) => {
    if (!dragging || dragging.kind !== role) return;
    if (layerGroupMap[dragging.id] === targetGroupId) return;
    const targetLayers = ids.filter((id) => layerGroupMap[id] === targetGroupId);
    if (targetLayers.length === 0) return;

    const fromIdx = ids.indexOf(dragging.id);
    const targetFirst = ids.indexOf(targetLayers[0]);
    if (fromIdx < 0) return;

    const remaining = ids.filter((id) => id !== dragging.id);
    if (fromIdx < targetFirst) {
      const targetLastIdx = remaining.lastIndexOf(targetLayers[targetLayers.length - 1]);
      remaining.splice(targetLastIdx + 1, 0, dragging.id);
    } else {
      const targetFirstIdx = remaining.indexOf(targetLayers[0]);
      remaining.splice(targetFirstIdx, 0, dragging.id);
    }
    applyLayerOrderPreservingHidden(role, remaining);
  };

  return {
    groups,
    layerGroupMap,
    dragging,
    draggingGroup,
    setLayerGroup,
    createGroup,
    hideGroup,
    restoreGroup,
    deleteGroup,
    beginDrag,
    moveDraggedLayer,
    beginDragGroup,
    moveDraggedGroup,
    moveDraggedGroupOverLayer,
    moveLayerOverGroup,
  };
}
