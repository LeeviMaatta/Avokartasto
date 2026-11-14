import type { Dispatch, SetStateAction } from "react";
import { RotateCcw, X } from "lucide-react";
import {
  DEFAULT_ARROW_ZOOM_KEY,
  DEFAULT_ROTATION_KEY,
  DEFAULT_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  SHORTCUT_DEFINITIONS,
  findShortcutConflicts,
  formatRotationKeyLabel,
  formatShortcutLabel,
  normalizeRotationKeyString,
  parseShortcuts,
  type ShortcutActionId,
} from "../../model/keyboardShortcuts";
import type { ModifierSettingKey } from "../../hooks/useShortcutCapture";

interface KeyboardSectionProps {
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
  capturingAction: ShortcutActionId | null;
  setCapturingAction: (action: ShortcutActionId | null) => void;
  capturingModifierSetting: ModifierSettingKey | null;
  setCapturingModifierSetting: (key: ModifierSettingKey | null) => void;
}

export function KeyboardSection({
  draft,
  setDraft,
  capturingAction,
  setCapturingAction,
  capturingModifierSetting,
  setCapturingModifierSetting,
}: KeyboardSectionProps) {
  const parsedShortcuts = parseShortcuts(draft.keyboardShortcuts);
  const shortcutConflicts = findShortcutConflicts(parsedShortcuts);

  const updateShortcut = (action: ShortcutActionId, value: string) => {
    setDraft((prev) => {
      const current = parseShortcuts(prev.keyboardShortcuts);
      return { ...prev, keyboardShortcuts: JSON.stringify({ ...current, [action]: value }) };
    });
  };

  const resetAllShortcuts = () => {
    setCapturingAction(null);
    setCapturingModifierSetting(null);
    setDraft((prev) => ({
      ...prev,
      keyboardShortcuts: JSON.stringify({ ...DEFAULT_SHORTCUTS }),
      rotationKey: DEFAULT_ROTATION_KEY,
      arrowZoomKey: DEFAULT_ARROW_ZOOM_KEY,
    }));
  };

  const rotationEnabled = draft.enableRotation !== "0";
  const capturingRotationKey = capturingModifierSetting === "rotationKey";
  const currentRotationKey =
    normalizeRotationKeyString(draft.rotationKey || DEFAULT_ROTATION_KEY) || DEFAULT_ROTATION_KEY;
  const isRotationCustomized = currentRotationKey !== DEFAULT_ROTATION_KEY;

  const capturingArrowZoomKey = capturingModifierSetting === "arrowZoomKey";
  const currentArrowZoomKey =
    normalizeRotationKeyString(draft.arrowZoomKey || DEFAULT_ARROW_ZOOM_KEY) ||
    DEFAULT_ARROW_ZOOM_KEY;
  const isArrowZoomCustomized = currentArrowZoomKey !== DEFAULT_ARROW_ZOOM_KEY;

  return (
    <>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <div className="font-medium text-slate-800 dark:text-zinc-200">
            Pikanäppäimet käytössä
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400">
            Nuolinäppäimet liikkuvat valikoissa ja siirtävät karttaa, kun kartta on valittuna. Esc palauttaa kartalle.
          </div>
        </div>
        <input
          type="checkbox"
          className="h-4 w-4 accent-blue-600"
          checked={draft.keyboardShortcutsEnabled !== "0"}
          onChange={(e) =>
            setDraft((prev) => ({
              ...prev,
              keyboardShortcutsEnabled: e.target.checked ? "1" : "0",
            }))
          }
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="flex flex-1 cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-blue-600"
            checked={rotationEnabled}
            onChange={(e) => {
              if (!e.target.checked && capturingRotationKey) setCapturingModifierSetting(null);
              setDraft((prev) => ({ ...prev, enableRotation: e.target.checked ? "1" : "0" }));
            }}
          />
          <div>
            <div className="font-medium text-slate-800 dark:text-zinc-200">Salli kartan kierto</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">
              Oletus: {formatRotationKeyLabel(DEFAULT_ROTATION_KEY)} + veto
            </div>
          </div>
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={!rotationEnabled}
            data-shortcut-capturing={capturingRotationKey ? "true" : undefined}
            onClick={() => {
              setCapturingAction(null);
              setCapturingModifierSetting(capturingRotationKey ? null : "rotationKey");
            }}
            className={`min-w-[124px] rounded-md border px-2.5 py-1 text-center font-mono text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${
              capturingRotationKey
                ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-300"
                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
            title="Klikkaa tai paina Enter määrittääksesi kiertonäppäimen (Esc peruuttaa)"
          >
            {capturingRotationKey
              ? "Paina näppäintä..."
              : `${formatRotationKeyLabel(currentRotationKey)} + veto`}
          </button>
          {isRotationCustomized && (
            <button
              type="button"
              disabled={!rotationEnabled}
              onClick={() => {
                if (capturingRotationKey) setCapturingModifierSetting(null);
                setDraft((prev) => ({ ...prev, rotationKey: DEFAULT_ROTATION_KEY }));
              }}
              className="rounded-md border border-slate-200 p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="Palauta oletuskiertonäppäin"
              aria-label="Palauta oletuskiertonäppäin"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-800 dark:text-zinc-200">
            Zoomaus nuolinäppäimillä
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400">
            Oletus: {formatRotationKeyLabel(DEFAULT_ARROW_ZOOM_KEY)} + ↑ / ↓
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            data-shortcut-capturing={capturingArrowZoomKey ? "true" : undefined}
            onClick={() => {
              setCapturingAction(null);
              setCapturingModifierSetting(capturingArrowZoomKey ? null : "arrowZoomKey");
            }}
            className={`min-w-[124px] rounded-md border px-2.5 py-1 text-center font-mono text-xs transition ${
              capturingArrowZoomKey
                ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-300"
                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
            title="Klikkaa tai paina Enter määrittääksesi nuolizoomauksen pikanäppäimen (Esc peruuttaa)"
          >
            {capturingArrowZoomKey
              ? "Paina näppäintä..."
              : `${formatRotationKeyLabel(currentArrowZoomKey)} + ↑ / ↓`}
          </button>
          {isArrowZoomCustomized && (
            <button
              type="button"
              onClick={() => {
                if (capturingArrowZoomKey) setCapturingModifierSetting(null);
                setDraft((prev) => ({ ...prev, arrowZoomKey: DEFAULT_ARROW_ZOOM_KEY }));
              }}
              className="rounded-md border border-slate-200 p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="Palauta oletusnäppäin nuolizoomaukselle"
              aria-label="Palauta oletusnäppäin nuolizoomaukselle"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-blue-600"
            checked={draft.enableDoubleClickZoom === "1"}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, enableDoubleClickZoom: e.target.checked ? "1" : "0" }))
            }
          />
          <span className="text-xs font-medium text-slate-800 dark:text-zinc-200">
            Zoomaa kaksoisklikkauksella
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-blue-600"
            checked={draft.removePendingMarkerOnDblClick !== "0"}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                removePendingMarkerOnDblClick: e.target.checked ? "1" : "0",
              }))
            }
          />
          <span className="text-xs font-medium text-slate-800 dark:text-zinc-200">
            Poista merkki tai lopeta muokkaus kaksoisklikkauksella
          </span>
        </label>
      </div>

      {shortcutConflicts.size > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
          Huomio: sama pikanäppäin on määritetty useammalle toiminnolle. Korjaa korostetut rivit, jos haluat välttää päällekkäisyydet.
        </div>
      )}

      <div className="space-y-4">
        {SHORTCUT_CATEGORIES.map((category) => {
          const defs = SHORTCUT_DEFINITIONS.filter((d) => d.category === category.id);
          return (
            <div key={category.id} className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                {category.label}
              </div>
              <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
                {defs.map((def) => {
                  const currentCombo = parsedShortcuts[def.id] ?? "";
                  const isCapturing = capturingAction === def.id;
                  const hasConflict = shortcutConflicts.has(def.id);
                  return (
                    <div
                      key={def.id}
                      data-kb-row="true"
                      className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${
                        hasConflict ? "bg-amber-50/70 dark:bg-amber-950/20" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-zinc-200">
                          <span>{def.label}</span>
                          {hasConflict && (
                            <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                              Päällekkäinen
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                          Oletus: {formatShortcutLabel(def.defaultKey)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          data-shortcut-capturing={isCapturing ? "true" : undefined}
                          onClick={() => {
                            setCapturingModifierSetting(null);
                            setCapturingAction(isCapturing ? null : def.id);
                          }}
                          className={`min-w-[92px] rounded-md border px-2.5 py-1 text-center font-mono text-xs transition ${
                            isCapturing
                              ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-300"
                              : hasConflict
                                ? "border-amber-400 bg-white text-amber-800 hover:bg-amber-50 dark:border-amber-600 dark:bg-zinc-900 dark:text-amber-300"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          }`}
                          title="Klikkaa tai paina Enter määrittääksesi pikanäppäimen (Esc peruuttaa)"
                        >
                          {isCapturing
                            ? "Paina näppäintä..."
                            : currentCombo
                              ? formatShortcutLabel(currentCombo)
                              : "Ei asetettu"}
                        </button>
                        {currentCombo && (
                          <button
                            type="button"
                            onClick={() => updateShortcut(def.id, "")}
                            className="rounded-md border border-slate-200 p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            title={`Tyhjennä pikanäppäin (${def.label})`}
                            aria-label={`Tyhjennä pikanäppäin: ${def.label}`}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="text-[11px] text-slate-500 dark:text-zinc-400">
          Vinkki: Valikot toimivat myös nuolinäppäimillä,{" "}
          <kbd className="rounded border border-slate-300 px-1 dark:border-zinc-700">Enter</kbd> valitsee ja{" "}
          <kbd className="rounded border border-slate-300 px-1 dark:border-zinc-700">Esc</kbd> palaa kartalle.
        </div>
        <button
          type="button"
          onClick={resetAllShortcuts}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <RotateCcw size={13} />
          <span>Palauta oletuspikanäppäimet</span>
        </button>
      </div>
    </>
  );
}
