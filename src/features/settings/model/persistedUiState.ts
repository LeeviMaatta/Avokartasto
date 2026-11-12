import { useMemo } from "react";
import { useMapStore } from "../../../store/mapStore";

/** Lukee ja tallentaa yksittäisen totuusarvoisen käyttöliittymätilan asetuksiin. */
export function usePersistedBool(key: string, defaultValue: boolean): [boolean, () => void] {
  const raw = useMapStore((s) => s.settings[key]);
  const value = raw === undefined || raw === "" ? defaultValue : raw !== "0";
  const toggle = () => {
    void useMapStore.getState().setSetting(key, value ? "0" : "1");
  };
  return [value, toggle];
}

/** Lukee ja tallentaa merkkijonojoukon (esim. avatut kansiot tai suljetut ryhmät) asetuksiin. */
export function usePersistedStringSet(key: string): [Set<string>, (id: string) => void] {
  const raw = useMapStore((s) => s.settings[key]);
  const set = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(raw || "[]");
      return Array.isArray(parsed)
        ? new Set(parsed.filter((item): item is string => typeof item === "string"))
        : new Set<string>();
    } catch {
      return new Set<string>();
    }
  }, [raw]);

  const toggle = (id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void useMapStore.getState().setSetting(key, JSON.stringify(Array.from(next)));
  };

  return [set, toggle];
}

/** Jäsentää asetusten haitariosioiden avatut tilat oletusarvoihin yhdistettynä. */
export function parseOpenSections(
  raw: string | undefined,
  defaults: Record<string, boolean>,
): Record<string, boolean> {
  if (!raw) return defaults;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
    const next = { ...defaults };
    for (const [k, v] of Object.entries(parsed)) {
      if (k in next && typeof v === "boolean") next[k] = v;
    }
    return next;
  } catch {
    return defaults;
  }
}
