import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { focusFirstNavigable, focusMapViewport, handleContainerArrowKeyDown } from "../shared/keyboardNavigation";

type Confirmation = { message: string; resolve: (value: boolean) => void };

export default function ConfirmDialog() {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<Confirmation>).detail;
      if (detail) setConfirmation(detail);
    };
    window.addEventListener("request-confirmation", handleRequest);
    return () => window.removeEventListener("request-confirmation", handleRequest);
  }, []);

  useEffect(() => {
    if (!confirmation) return;
    requestAnimationFrame(() => focusFirstNavigable(dialogRef.current));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        confirmation.resolve(false);
        setConfirmation(null);
        requestAnimationFrame(() => focusMapViewport());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmation]);

  if (!confirmation) return null;
  const close = (answer: boolean) => {
    confirmation.resolve(answer);
    setConfirmation(null);
    requestAnimationFrame(() => focusMapViewport());
  };

  return (
    <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        onKeyDown={(e) =>
          handleContainerArrowKeyDown(e, {
            orientation: "both",
            onEscape: () => close(false),
          })
        }
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-100 p-2 text-red-600 dark:bg-red-950 dark:text-red-400"><AlertTriangle size={20} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Vahvista poisto</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">{confirmation.message}</p>
          </div>
          <button className="text-slate-400 hover:text-slate-700 dark:hover:text-white" onClick={() => close(false)} aria-label="Sulje"><X size={18} /></button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800" onClick={() => close(false)}>Ei</button>
          <button className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700" onClick={() => close(true)}>Kyllä, poista</button>
        </div>
      </div>
    </div>
  );
}
