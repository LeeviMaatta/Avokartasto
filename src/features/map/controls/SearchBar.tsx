import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMapStore } from "../../../store/mapStore";
import { fetchWithDebug } from "../../debug/debugFetch";

type SearchResult = { display_name: string; lat: string; lon: string };
const SEARCH_TIMEOUT_MS = 10_000;

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const rawOverlayOpacity = Number(useMapStore((s) => s.settings.uiOverlayOpacity ?? "1"));
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;

  const search = async () => {
    const text = query.trim();
    if (!text) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithDebug(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=fi&q=${encodeURIComponent(text)}`,
        { signal: controller.signal },
        "place search",
      );
      if (!response.ok) throw new Error("Paikkahaku epäonnistui.");
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Paikkahaun vastaus oli virheellinen.");
      const valid = data.filter((item): item is SearchResult =>
        typeof item === "object" && item !== null &&
        typeof item.display_name === "string" &&
        typeof item.lat === "string" && typeof item.lon === "string"
      );
      setResults(valid);
      if (valid.length === 0) setError("Paikkaa ei löytynyt.");
    } catch (reason) {
      if (searchController.current !== controller) return;
      if (controller.signal.aborted) {
        setError("Paikkahaku kesti liian kauan. Yritä uudelleen.");
        return;
      }
      console.error("Paikkahaku epäonnistui", reason);
      setError(reason instanceof Error ? reason.message : "Paikkahaku epäonnistui.");
    } finally {
      window.clearTimeout(timeout);
      if (searchController.current === controller) searchController.current = null;
      if (searchController.current === null) setLoading(false);
    }
  };

  useEffect(() => () => {
    searchController.current?.abort();
    searchController.current = null;
  }, []);

  const select = (result: SearchResult) => {
    const lat = Number(result.lat);
    const lon = Number(result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    window.dispatchEvent(new CustomEvent("map-search-location", { detail: { lat, lon } }));
    setQuery(result.display_name);
    setResults([]);
  };

  return (
    <div className="pointer-events-auto absolute left-1/2 top-2 z-30 w-[min(24rem,calc(100vw-9rem))] -translate-x-1/2 sm:top-3" style={{ opacity: overlayOpacity }}>
      <form className="flex rounded-lg bg-white/95 p-1 shadow-lg backdrop-blur dark:bg-gray-800/95" onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <Search size={18} className="m-2 shrink-0 text-gray-500" />
        <input className="min-w-0 flex-1 bg-transparent px-1 text-sm text-gray-800 outline-none placeholder:text-gray-500 dark:text-white" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hae paikkaa..." aria-label="Hae paikkaa" />
        {query && <button type="button" className="p-1 text-gray-500" onClick={() => { setQuery(""); setResults([]); setError(null); }} aria-label="Tyhjennä haku"><X size={15} /></button>}
        <button type="submit" className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50" disabled={loading}>{loading ? "..." : "Hae"}</button>
      </form>
      {(results.length > 0 || error) && (
        <div className="mt-1 overflow-hidden rounded-lg bg-white/95 text-xs text-gray-800 shadow-lg dark:bg-gray-800/95 dark:text-white">
          {results.map((result) => (
            <button key={`${result.lat}:${result.lon}`} className="block w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => select(result)}>{result.display_name}</button>
          ))}
          {error && <div className="px-3 py-2 text-amber-700 dark:text-amber-300">{error}</div>}
        </div>
      )}
    </div>
  );
}
