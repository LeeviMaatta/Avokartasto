import { Search, X, Loader2 } from "lucide-react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const searchController = useRef<AbortController | null>(null);
  const rawOverlayOpacity = Number(useMapStore((s) => s.settings.uiOverlayOpacity ?? "1"));
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;

  const search = async (targetQuery?: string) => {
    const text = (targetQuery !== undefined ? targetQuery : query).trim();
    if (!text || text.length < 2) return;
    
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

  // Debounce search by 1 second when query changes
  useEffect(() => {
    const text = query.trim();
    if (!text || text.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void search(text);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Close search results on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setResults([]);
        setError(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setResults([]);
        setError(null);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
    setError(null);
  };

  return (
    <div 
      ref={containerRef}
      className="pointer-events-auto absolute left-1/2 top-2 z-30 w-[min(26rem,calc(100vw-9.5rem))] -translate-x-1/2 sm:top-3" 
      style={{ opacity: overlayOpacity }}
    >
      <form 
        className="flex items-center rounded-xl border border-slate-200/80 bg-white/95 p-1 shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95" 
        onSubmit={(event) => { event.preventDefault(); void search(); }}
      >
        <Search size={18} className="m-2 shrink-0 text-slate-400 dark:text-zinc-500" />
        <input 
          className="min-w-0 flex-1 bg-transparent px-1 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-zinc-500" 
          value={query} 
          onChange={(event) => setQuery(event.target.value)} 
          placeholder="Hae paikkaa tai osoitetta..." 
          aria-label="Hae paikkaa" 
        />
        {loading && <Loader2 size={15} className="animate-spin text-blue-500 mr-1 shrink-0" />}
        {query && (
          <button 
            type="button" 
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300" 
            onClick={() => { setQuery(""); setResults([]); setError(null); }} 
            aria-label="Tyhjennä haku"
          >
            <X size={15} />
          </button>
        )}
        <button 
          type="submit" 
          className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50 transition" 
          disabled={loading}
        >
          {loading ? "..." : "Hae"}
        </button>
      </form>

      {(results.length > 0 || error) && (
        <div className="mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white/98 text-xs text-slate-800 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/98 dark:text-zinc-100">
          {results.map((result) => (
            <button 
              key={`${result.lat}:${result.lon}`} 
              type="button"
              className="block w-full border-b border-slate-100 px-3.5 py-2.5 text-left transition hover:bg-slate-100 last:border-none dark:border-zinc-800/80 dark:hover:bg-zinc-900" 
              onClick={() => select(result)}
            >
              {result.display_name}
            </button>
          ))}
          {error && <div className="px-3.5 py-2.5 text-amber-700 dark:text-amber-400 font-medium">{error}</div>}
        </div>
      )}
    </div>
  );
}
