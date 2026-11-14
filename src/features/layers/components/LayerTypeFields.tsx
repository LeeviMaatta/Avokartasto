import { useRef, useState } from "react";
import type { ApiType, SourceRole } from "../../../shared/types/sourceTypes";
import { useDrawLayerStore } from "../model/drawLayerStore";
import { getLayerTypeConfig, parseLayerParams } from "../model/layerTypeConfig";
import { loadImageFileForLayer, loadVectorFileText } from "../services/imageLayerLoader";
import { ImageExtentFields } from "./ImageExtentFields";
import { PdfPageSelector } from "./PdfPageSelector";

export interface LayerFieldValues {
  name: string;
  base_path: string;
  pattern: string;
  url: string;
  role: SourceRole;
  api_type: ApiType;
  opacity: number;
  tile_size: number;
  max_zoom: number;
  layer_name: string;
  style: string;
  attribution: string;
  params: string;
}

interface LayerTypeFieldsProps {
  value: LayerFieldValues;
  onChange: (patch: Partial<LayerFieldValues>) => void;
}

const INPUT_CLASS =
  "mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900";

export function LayerTypeFields({ value, onChange }: LayerTypeFieldsProps) {
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const selectedFileRef = useRef<File | null>(null);
  const currentViewExtent3857 = useDrawLayerStore((s) => s.currentViewExtent3857);
  const config = getLayerTypeConfig(value.api_type, value.role);
  const params = parseLayerParams(value.params);

  const updateParam = (patch: Record<string, unknown>) => {
    onChange({ params: JSON.stringify({ ...params, ...patch }) });
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    selectedFileRef.current = file;
    setFileError(null);
    setFileLoading(true);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    try {
      if (value.api_type === "img") {
        const loaded = await loadImageFileForLayer(file, currentViewExtent3857, 1);
        onChange({
          name: value.name.trim() ? value.name : baseName,
          params: JSON.stringify({
            ...params,
            dataUrl: loaded.dataUrl,
            extent: loaded.extent,
            imageWidth: loaded.width,
            imageHeight: loaded.height,
            fileName: file.name,
            ...(loaded.pageNumber ? { pdfPage: loaded.pageNumber } : {}),
            ...(loaded.pageCount ? { pdfPageCount: loaded.pageCount } : {}),
          }),
        });
      } else {
        const inlineData = await loadVectorFileText(file);
        onChange({
          name: value.name.trim() ? value.name : baseName,
          params: JSON.stringify({ ...params, inlineData, fileName: file.name }),
        });
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Tiedoston luku epäonnistui.");
    } finally {
      setFileLoading(false);
    }
  };

  const fileName = typeof params.fileName === "string" ? params.fileName : "";
  const pdfPage = typeof params.pdfPage === "number" ? params.pdfPage : 1;
  const pdfPageCount = typeof params.pdfPageCount === "number" ? params.pdfPageCount : undefined;
  const isPdfSelected =
    value.api_type === "img" &&
    (fileName.toLowerCase().endsWith(".pdf") ||
      value.url.trim().toLowerCase().split("?")[0].endsWith(".pdf") ||
      pdfPageCount !== undefined);
  const wmsFormat = typeof params.format === "string" ? params.format : "image/png";
  const strokeColor = typeof params.strokeColor === "string" ? params.strokeColor : "#2563eb";
  const strokeWidth = typeof params.strokeWidth === "number" ? params.strokeWidth : 3;
  const isMbtiles = value.base_path.trim().toLowerCase().endsWith(".mbtiles");

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-200">
          {value.role === "basemap" ? "Pohjakartta" : "Päällyskartta"}
        </span>
        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-medium text-[#1671a8] dark:bg-blue-950/60 dark:text-sky-300">
          {config.label}
        </span>
      </div>

      <label>
        Nimi
        <input className={INPUT_CLASS} value={value.name} placeholder="Esim. Oma karttataso" onChange={(e) => onChange({ name: e.target.value })} />
      </label>

      {config.showFilePicker && (
        <div className="space-y-1">
          <div className="text-slate-700 dark:text-zinc-200">Valitse tiedosto koneelta</div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">
              Selaa tiedostoa...
              <input
                type="file"
                accept={config.fileAccept}
                className="hidden"
                onChange={(e) => void handleFileChange(e.target.files?.[0])}
              />
            </label>
            <span className="truncate text-xs text-slate-500 dark:text-zinc-400">
              {fileName || "Ei valittua tiedostoa"}
            </span>
          </div>
          {fileError && <div className="text-xs text-red-600">{fileError}</div>}
        </div>
      )}

      {config.showLocalPath && (
        <label className="block">
          Kansio tai MBTiles-tiedosto
          <input
            className={INPUT_CLASS}
            value={value.base_path}
            placeholder="esim. C:\kartat\tiilet1;C:\kartat\tiilet2"
            onChange={(e) => onChange({ base_path: e.target.value })}
          />
          <span className="mt-1 block text-[11px] text-slate-500 dark:text-zinc-400">
            Voit lisätä useamman kansion tai MBTiles-tiedoston erottamalla polut puolipisteellä (<code>;</code>).
          </span>
        </label>
      )}

      {config.showPattern && !isMbtiles && (
        <label>
          Laatan polku / malli
          <input className={`${INPUT_CLASS} font-mono text-xs`} value={value.pattern} placeholder="{z}/{x}/{y}.png" onChange={(e) => onChange({ pattern: e.target.value })} />
        </label>
      )}

      {config.showUrl && (
        <label>
          {config.urlLabel}
          <input className={INPUT_CLASS} value={value.url} placeholder={config.urlPlaceholder} onChange={(e) => onChange({ url: e.target.value })} />
        </label>
      )}

      {isPdfSelected && (
        <PdfPageSelector
          selectedFileRef={selectedFileRef}
          url={value.url}
          pdfPage={pdfPage}
          pdfPageCount={pdfPageCount}
          loading={fileLoading}
          viewExtent3857={currentViewExtent3857}
          onLoadingChange={setFileLoading}
          onErrorChange={setFileError}
          onUpdateParams={updateParam}
        />
      )}

      {config.showLayerName && (
        <label>
          Layer / taso{config.layerNameRequired ? " *" : ""}
          <input className={INPUT_CLASS} value={value.layer_name} placeholder="esim. taustakartta" onChange={(e) => onChange({ layer_name: e.target.value })} />
        </label>
      )}

      {config.showStyle && (
        <label>
          Tyyli{value.api_type === "vector_tile" ? " (valinnainen)" : ""}
          <input className={INPUT_CLASS} value={value.style} placeholder={value.api_type === "wmts" ? "default" : ""} onChange={(e) => onChange({ style: e.target.value })} />
        </label>
      )}

      {config.showWmsFormat && (
        <label>
          Kuvaformaatti
          <select className={INPUT_CLASS} value={wmsFormat} onChange={(e) => updateParam({ format: e.target.value })}>
            <option value="image/png">image/png</option>
            <option value="image/jpeg">image/jpeg</option>
          </select>
        </label>
      )}

      {(config.showTileSize || config.showMaxZoom) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {config.showTileSize && (
            <label>
              Laatan koko
              <input type="number" min="64" max="2048" className={INPUT_CLASS} value={value.tile_size} onChange={(e) => onChange({ tile_size: Number(e.target.value) })} />
            </label>
          )}
          {config.showMaxZoom && (
            <label>
              Maksimizoom
              <input type="number" min="0" max="24" className={INPUT_CLASS} value={value.max_zoom} onChange={(e) => onChange({ max_zoom: Number(e.target.value) })} />
            </label>
          )}
        </div>
      )}

      {config.showImageExtent && (
        <ImageExtentFields
          params={value.params}
          opacity={value.opacity}
          onParamsChange={(nextParams) => onChange({ params: nextParams })}
          onOpacityChange={(nextOpacity) => onChange({ opacity: nextOpacity })}
        />
      )}

      {config.showDrawStyle && (
        <div className="grid grid-cols-2 gap-3">
          <label>
            Viivan väri
            <input type="color" className="mt-1 h-9 w-full cursor-pointer rounded border border-slate-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900" value={strokeColor} onChange={(e) => updateParam({ strokeColor: e.target.value })} />
          </label>
          <label>
            Viivan paksuus (px)
            <input type="number" min="1" max="12" className={INPUT_CLASS} value={strokeWidth} onChange={(e) => updateParam({ strokeWidth: Math.max(1, Math.min(12, Number(e.target.value))) })} />
          </label>
        </div>
      )}

      {config.showAttribution && (
        <label>
          Lähde / attribution
          <input className={INPUT_CLASS} value={value.attribution} onChange={(e) => onChange({ attribution: e.target.value })} />
        </label>
      )}
    </div>
  );
}
