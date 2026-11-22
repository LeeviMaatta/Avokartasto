import { useEffect, useRef } from "react";
import { focusFirstNavigable, focusMapViewport, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import { isNewLayerValid, type NewLayerSource } from "../model/layerTypeConfig";
import { LayerTypeFields } from "./LayerTypeFields";

export type { NewLayerSource };

interface AddLayerModalProps {
  value: NewLayerSource;
  open: boolean;
  submitting?: boolean;
  error?: string | null;
  onChange: (value: NewLayerSource) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function AddLayerModal({
  value,
  open,
  submitting = false,
  error = null,
  onChange,
  onClose,
  onSubmit,
}: AddLayerModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleClose = () => {
    onCloseRef.current();
    requestAnimationFrame(() => focusMapViewport());
  };

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const firstInput = dialogRef.current?.querySelector<HTMLElement>("input, select, textarea");
      if (firstInput) firstInput.focus();
      else focusFirstNavigable(dialogRef.current);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  const canSubmit = isNewLayerValid(value) && !submitting;
  const submitLabel = submitting
    ? "Ladataan..."
    : value.api_type === "draw"
      ? "Luo ja aloita piirtäminen"
      : "Lisää";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && handleClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
        onKeyDown={(e) => handleContainerArrowKeyDown(e, { onEscape: handleClose })}
      >
        <div className="overflow-y-auto p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-zinc-800">
            <div className="text-lg font-semibold text-[#164b73] dark:text-sky-400">Lisää karttataso</div>
            <button
              type="button"
              className="text-xl text-slate-400 hover:text-slate-700 dark:hover:text-white"
              onClick={handleClose}
              title="Sulje (Esc)"
            >
              ×
            </button>
          </div>
          <LayerTypeFields
            value={value}
            onChange={(patch) => onChange({ ...value, ...patch })}
          />
          {error && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 px-4 py-2 dark:border-zinc-700"
              onClick={handleClose}
            >
              Peruuta
            </button>
            <button
              type="button"
              className="rounded bg-[#1671a8] px-4 py-2 font-medium text-white hover:bg-[#125d8c] disabled:opacity-50"
              disabled={!canSubmit}
              onClick={onSubmit}
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
