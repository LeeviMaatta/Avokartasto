import { ChevronDown, ChevronUp, Download, Navigation } from "lucide-react";
import { formatRouteDistance, formatRouteDuration, type RouteResult } from "../services/routeService";

interface RouteStepsListProps {
  routeResult: RouteResult;
  stepsOpen: boolean;
  exportMsg: string | null;
  onToggleSteps: () => void;
  onExport: () => void;
}

export function RouteStepsList({
  routeResult,
  stepsOpen,
  exportMsg,
  onToggleSteps,
  onExport,
}: RouteStepsListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-slate-100 dark:border-zinc-800">
      <div className="flex items-center justify-between bg-slate-50/70 px-3 py-2 dark:bg-zinc-900/50">
        <div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            {formatRouteDuration(routeResult.duration)} · {formatRouteDistance(routeResult.distance)}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-zinc-500">
            Moottori: {routeResult.provider}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800 transition"
            title="Vie reitti GeoJSON-tiedostona"
          >
            <Download size={12} /> Vie
          </button>
          <button
            type="button"
            onClick={onToggleSteps}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800 transition"
            title={stepsOpen ? "Piilota ohjeet" : "Näytä ohjeet"}
          >
            {stepsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {exportMsg && (
        <div className={`px-3 py-1 text-[11px] ${exportMsg.startsWith("Vienti epäonnistui") ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {exportMsg}
        </div>
      )}

      {stepsOpen && routeResult.steps.length > 0 && (
        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/80">
          {routeResult.steps.map((step, i) => (
            <button
              key={i}
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("map-focus", {
                    detail: { lon: step.coord[0], lat: step.coord[1], zoom: 16 },
                  }),
                )
              }
              className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-900/60 transition"
            >
              <div className="flex items-start gap-2 min-w-0">
                <Navigation size={12} className="mt-0.5 shrink-0 text-blue-500" />
                <span className="text-[11px] leading-snug text-slate-700 dark:text-zinc-200">
                  {step.instruction}
                </span>
              </div>
              {step.distance > 0 && (
                <span className="shrink-0 text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                  {formatRouteDistance(step.distance)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
