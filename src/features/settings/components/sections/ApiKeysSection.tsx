import type { Dispatch, SetStateAction } from "react";
import { SETTING_KEYS } from "../../model/settingFields";

interface ApiKeysSectionProps {
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
}

export function ApiKeysSection({ draft, setDraft }: ApiKeysSectionProps) {
  return (
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
  );
}
