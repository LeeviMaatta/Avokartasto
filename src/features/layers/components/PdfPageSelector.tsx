import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MutableRefObject } from "react";
import type { Extent3857 } from "../services/imageLayerLoader";
import { loadImageFileForLayer, loadImageUrlForLayer } from "../services/imageLayerLoader";

interface PdfPageSelectorProps {
  selectedFileRef: MutableRefObject<File | null>;
  url: string;
  pdfPage: number;
  pdfPageCount?: number;
  loading: boolean;
  viewExtent3857: Extent3857;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (error: string | null) => void;
  onUpdateParams: (patch: Record<string, unknown>) => void;
}

export function PdfPageSelector({
  selectedFileRef,
  url,
  pdfPage,
  pdfPageCount,
  loading,
  viewExtent3857,
  onLoadingChange,
  onErrorChange,
  onUpdateParams,
}: PdfPageSelectorProps) {
  const applyPage = async (page: number) => {
    const safePage = Math.max(1, Math.round(page) || 1);
    onErrorChange(null);
    if (selectedFileRef.current) {
      onLoadingChange(true);
      try {
        const loaded = await loadImageFileForLayer(selectedFileRef.current, viewExtent3857, safePage);
        onUpdateParams({
          dataUrl: loaded.dataUrl,
          extent: loaded.extent,
          imageWidth: loaded.width,
          imageHeight: loaded.height,
          pdfPage: loaded.pageNumber ?? safePage,
          pdfPageCount: loaded.pageCount,
        });
      } catch (err) {
        onErrorChange(err instanceof Error ? err.message : "PDF-sivun lataus epäonnistui.");
      } finally {
        onLoadingChange(false);
      }
      return;
    }

    const rawUrl = url.trim();
    if (/^https?:\/\//i.test(rawUrl)) {
      onLoadingChange(true);
      try {
        const loaded = await loadImageUrlForLayer(rawUrl, viewExtent3857, safePage);
        onUpdateParams({
          dataUrl: loaded.dataUrl,
          extent: loaded.extent,
          imageWidth: loaded.width,
          imageHeight: loaded.height,
          pdfPage: loaded.pageNumber ?? safePage,
          pdfPageCount: loaded.pageCount,
        });
      } catch (err) {
        onErrorChange(err instanceof Error ? err.message : "PDF-sivun lataus epäonnistui.");
      } finally {
        onLoadingChange(false);
      }
    } else {
      onUpdateParams({ pdfPage: safePage });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
      <span className="font-medium text-slate-700 dark:text-zinc-200">PDF-sivu:</span>
      <button
        type="button"
        disabled={loading || pdfPage <= 1}
        aria-label="Edellinen sivu"
        className="rounded border border-slate-300 p-1 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
        onClick={() => void applyPage(pdfPage - 1)}
      >
        <ChevronLeft size={14} />
      </button>
      <input
        type="number"
        min={1}
        max={pdfPageCount}
        disabled={loading}
        className="w-16 rounded border border-slate-300 bg-white px-2 py-0.5 text-center dark:border-zinc-700 dark:bg-zinc-900"
        value={pdfPage}
        onChange={(e) => onUpdateParams({ pdfPage: Math.max(1, Number(e.target.value) || 1) })}
        onBlur={() => {
          if (selectedFileRef.current) void applyPage(pdfPage);
        }}
      />
      {pdfPageCount !== undefined && (
        <span className="text-slate-500 dark:text-zinc-400">/ {pdfPageCount}</span>
      )}
      <button
        type="button"
        disabled={loading || (pdfPageCount !== undefined && pdfPage >= pdfPageCount)}
        aria-label="Seuraava sivu"
        className="rounded border border-slate-300 p-1 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
        onClick={() => void applyPage(pdfPage + 1)}
      >
        <ChevronRight size={14} />
      </button>
      <button
        type="button"
        disabled={loading}
        className="ml-auto rounded border border-slate-300 bg-white px-2 py-0.5 font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        onClick={() => void applyPage(pdfPage)}
      >
        {loading ? "Ladataan..." : "Lataa sivu"}
      </button>
    </div>
  );
}
