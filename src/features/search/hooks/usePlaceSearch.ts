import { useCallback, useEffect, useRef, useState } from "react";
import { searchNominatim, type NominatimSearchHit } from "../services/nominatimService";
import { searchSavedMarkers, type MarkerSearchHit } from "../../markers/domain/markerSearch";

const SEARCH_TIMEOUT_MS = 10_000;

export function usePlaceSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimSearchHit[]>([]);
  const [markerResults, setMarkerResults] = useState<MarkerSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchController = useRef<AbortController | null>(null);

  const clearResults = useCallback(() => {
    setResults([]);
    setMarkerResults([]);
    setError(null);
  }, []);

  const resetSearch = useCallback(() => {
    setQuery("");
    clearResults();
  }, [clearResults]);

  const search = useCallback(async (targetQuery?: string) => {
    const text = (targetQuery !== undefined ? targetQuery : query).trim();
    if (!text) return;

    let foundMarkers: MarkerSearchHit[] = [];
    try {
      foundMarkers = await searchSavedMarkers(text);
      setMarkerResults(foundMarkers);
    } catch {
      setMarkerResults([]);
    }

    if (text.length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    try {
      const valid = await searchNominatim(text, {
        limit: 5,
        signal: controller.signal,
        label: "place search",
      });
      setResults(valid);
      if (valid.length === 0 && foundMarkers.length === 0) setError("Paikkaa ei löytynyt.");
    } catch (reason) {
      if (searchController.current !== controller) return;
      if (controller.signal.aborted) {
        if (foundMarkers.length === 0) setError("Paikkahaku kesti liian kauan. Yritä uudelleen.");
        return;
      }
      console.error("Paikkahaku epäonnistui", reason);
      if (foundMarkers.length === 0) {
        setError(reason instanceof Error ? reason.message : "Paikkahaku epäonnistui.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (searchController.current === controller) searchController.current = null;
      if (searchController.current === null) setLoading(false);
    }
  }, [query]);

  // Haetaan omat merkit heti kirjoittaessa ja Nominatim 1 s viiveellä
  useEffect(() => {
    const text = query.trim();
    if (!text) {
      clearResults();
      return;
    }

    let cancelled = false;
    void searchSavedMarkers(text)
      .then((hits) => {
        if (!cancelled) setMarkerResults(hits);
      })
      .catch(() => {
        if (!cancelled) setMarkerResults([]);
      });

    if (text.length < 2) {
      setResults([]);
      setError(null);
      return () => { cancelled = true; };
    }
    const timer = window.setTimeout(() => {
      void search(text);
    }, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, clearResults, search]);

  useEffect(() => () => {
    searchController.current?.abort();
    searchController.current = null;
  }, []);

  return {
    query,
    setQuery,
    results,
    markerResults,
    loading,
    error,
    search,
    clearResults,
    resetSearch,
  };
}
