import { useEffect, useRef } from "react";
import type { LocalSource } from "../../../infrastructure/tauri";
import type { LayerViewDraft } from "../model/layerViewTypes";
import { getLayerTypeConfig, parseLayerParams } from "../model/layerTypeConfig";
import { useDrawLayerStore } from "../model/drawLayerStore";
import { focusFirstNavigable, focusMapViewport, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import { LayerTypeFields } from "./LayerTypeFields";

interface LayerEditorModalProps {
  editDraft: LocalSource | null;
  viewDraft: LayerViewDraft;
  onEditDraftChange: (value: LocalSource) => void;
  onViewDraftChange: (value: LayerViewDraft) => void;
  onClose: () => void;
  onSaveSource: () => void;
}

export default function LayerEditorModal({
  editDraft,
  viewDraft,
  onEditDraftChange,
  onViewDraftChange,
  onClose,
  onSaveSource,
}: LayerEditorModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isOpen = Boolean(editDraft);

  const handleClose = () => {
    onClose();
    requestAnimationFrame(() => focusMapViewport());
  };

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => focusFirstNavigable(dialogRef.current));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!editDraft) return null;

  const isDefault = Boolean(editDraft.is_default);
  const config = getLayerTypeConfig(editDraft.api_type, editDraft.role);
  const parsedParams = parseLayerParams(editDraft.params);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
      onMouseDown={(event) => event.target === event.currentTarget && handleClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
        onKeyDown={(e) => handleContainerArrowKeyDown(e, { onEscape: handleClose })}
      >
        <div className="overflow-x-hidden overflow-y-auto p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-[#164b73] dark:text-sky-400">Muokkaa karttatasoa</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {isDefault ? "Oletustaso" : "Tuotu taso"}
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">
                {isDefault ? "Sisäänrakennettu oletuskarttataso." : "Käyttäjän lisäämä tai tiedostosta tuotu karttataso."}
              </div>
            </div>
            <button
              type="button"
              className="rounded p-1 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-white"
              onClick={handleClose}
              title="Sulje (Esc)"
            >
              ×
            </button>
          </div>

          <div className="grid gap-3">
            <LayerTypeFields
              value={editDraft}
              onChange={(patch) => onEditDraftChange({ ...editDraft, ...patch })}
            />

            {!config.showImageExtent && (
              <label>
                Läpinäkyvyys: {Math.round(editDraft.opacity * 100)}%
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  className="mt-2 w-full accent-[#1671a8]"
                  value={editDraft.opacity}
                  onChange={(e) => onEditDraftChange({ ...editDraft, opacity: Number(e.target.value) })}
                />
              </label>
            )}

            {editDraft.api_type === "draw" && (
              <button
                type="button"
                className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#1671a8] hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-sky-300"
                onClick={() => {
                  const color = typeof parsedParams.strokeColor === "string" ? parsedParams.strokeColor : undefined;
                  const width = typeof parsedParams.strokeWidth === "number" ? parsedParams.strokeWidth : undefined;
                  useDrawLayerStore.getState().startDrawingLayer(editDraft.id, color, width);
                  handleClose();
                }}
              >
                Muokkaa piirroksia kartalla
              </button>
            )}

            {editDraft.api_type === "img" && (
              <button
                type="button"
                className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#1671a8] hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-sky-300"
                onClick={() => {
                  useDrawLayerStore.getState().setAdjustingImageSourceId(editDraft.id);
                  handleClose();
                }}
              >
                Säädä kuvan sijaintia kartalla
              </button>
            )}

            {config.showZoomViewSettings && (
              <div className="border-t border-slate-200 pt-3 dark:border-zinc-800">
                <div className="mb-2 font-semibold text-[#164b73] dark:text-sky-400">Zoomaus ja suurennus</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>
                    Zoom offset
                    <select
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                      value={viewDraft.zoomOffset}
                      onChange={(e) => onViewDraftChange({ ...viewDraft, zoomOffset: Number(e.target.value) })}
                    >
                      {[-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((v) => (
                        <option key={v} value={v}>{v > 0 ? `+${v}` : v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Suurennus
                    <select
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                      value={viewDraft.magnification}
                      onChange={(e) => onViewDraftChange({ ...viewDraft, magnification: Number(e.target.value) })}
                    >
                      <option value={1}>1x</option>
                      <option value={2}>2x</option>
                      <option value={4}>4x</option>
                    </select>
                  </label>
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                  Positiivinen offset siirtää aineiston alemmalta zoomilta ylemmälle karttazoomille.
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="rounded border border-slate-300 px-4 py-2 dark:border-zinc-700" onClick={handleClose}>Peruuta</button>
            <button type="button" className="rounded bg-[#1671a8] px-4 py-2 font-medium text-white hover:bg-[#125d8c]" onClick={onSaveSource}>Tallenna</button>
          </div>
        </div>
      </div>
    </div>
  );
}
