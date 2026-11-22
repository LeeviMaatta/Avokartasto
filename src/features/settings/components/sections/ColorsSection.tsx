import type { Dispatch, SetStateAction } from "react";

interface ColorsSectionProps {
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
}

const COLOR_GROUPS = [
  {
    heading: "Merkit",
    items: [
      ["savedMarkerColor", "Tallennettujen merkkien väri", "#dc2626"],
      ["unsavedMarkerColor", "Tallentamattoman merkin väri", "#f97316"],
    ] as const,
  },
  {
    heading: "Mittaukset",
    items: [
      ["savedMeasurementColor", "Tallennettujen mittausten väri", "#16a34a"],
      ["unsavedMeasurementColor", "Tallentamattoman mittauksen väri", "#2563eb"],
    ] as const,
  },
];

export function ColorsSection({ draft, setDraft }: ColorsSectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {COLOR_GROUPS.map((group) => (
          <div
            key={group.heading}
            className="space-y-3 rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <div className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              {group.heading}
            </div>
            {group.items.map(([key, label, fallback]) => {
              const value = draft[key] || fallback;
              return (
                <label key={key} className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
                    {label}
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                      value={value}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    />
                    <span className="font-mono text-xs">{value}</span>
                  </div>
                </label>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          onClick={() =>
            setDraft({
              ...draft,
              savedMarkerColor: "#dc2626",
              unsavedMarkerColor: "#f97316",
              savedMeasurementColor: "#16a34a",
              unsavedMeasurementColor: "#2563eb",
            })
          }
        >
          Palauta oletusvärit
        </button>
      </div>
    </>
  );
}
