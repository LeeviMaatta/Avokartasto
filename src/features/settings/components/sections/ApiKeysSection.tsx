import { useState, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { parseCustomApiKeys } from "../../../map/services/resolveUrl";
import { SETTING_KEYS } from "../../model/settingFields";

interface ApiKeysSectionProps {
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
}

const BUILTIN_KEY_SET = new Set(SETTING_KEYS.map(([k]) => k));

export function ApiKeysSection({ draft, setDraft }: ApiKeysSectionProps) {
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const customKeys = parseCustomApiKeys(draft.customApiKeys);
  const customEntries = Object.entries(customKeys);

  const saveCustomKeys = (next: Record<string, string>) => {
    setDraft((prev) => ({ ...prev, customApiKeys: JSON.stringify(next) }));
  };

  const handleAddKey = () => {
    const cleanKey = newKeyName.trim();
    const cleanVal = newKeyValue.trim();
    if (!cleanKey || !/^[A-Za-z0-9_-]+$/.test(cleanKey)) {
      setError("Tunnus saa sisältää vain kirjaimia, numeroita, '_' ja '-'.");
      return;
    }
    if (BUILTIN_KEY_SET.has(cleanKey)) {
      setError("Tunnus on jo sisäänrakennettu asetusavain.");
      return;
    }
    if (!cleanVal) {
      setError("Syötä avaimen arvo.");
      return;
    }
    setError(null);
    saveCustomKeys({ ...customKeys, [cleanKey]: cleanVal });
    setNewKeyName("");
    setNewKeyValue("");
  };

  const handleRemoveKey = (key: string) => {
    const next = { ...customKeys };
    delete next[key];
    saveCustomKeys(next);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {SETTING_KEYS.map(([k, label]) => (
          <label key={k} className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">{label}</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              value={draft[k] ?? ""}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
              placeholder="Syötä avain tai tunnus..."
            />
          </label>
        ))}
      </div>

      <div className="border-t border-slate-200 pt-3 dark:border-zinc-800">
        <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-zinc-200">
          Omat API-avaimet
        </div>
        <div className="mb-3 text-[11px] text-slate-500 dark:text-zinc-400">
          Käytä karttatason URL-osoitteessa muodossa <code>{"{secret:tunnus}"}</code> (esim. <code>{"{secret:maptilerKey}"}</code>).
        </div>

        {customEntries.length > 0 && (
          <div className="mb-3 space-y-2">
            {customEntries.map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-zinc-300">
                    <span className="truncate font-mono">{key}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {`{secret:${key}}`}
                    </span>
                  </div>
                  <input
                    type="password"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    value={val}
                    onChange={(e) => saveCustomKeys({ ...customKeys, [key]: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveKey(key)}
                  className="mt-5 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  title="Poista avain"
                  aria-label={`Poista avain ${key}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="text"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={newKeyName}
            onChange={(e) => {
              setNewKeyName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Tunnus (esim. maptilerKey)"
          />
          <input
            type="password"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={newKeyValue}
            onChange={(e) => {
              setNewKeyValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="API-avain..."
          />
          <button
            type="button"
            onClick={handleAddKey}
            className="flex items-center justify-center gap-1 rounded-lg bg-[#1671a8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#125d8c]"
          >
            <Plus size={14} />
            <span>Lisää</span>
          </button>
        </div>
        {error && <div className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{error}</div>}
      </div>
    </div>
  );
}
