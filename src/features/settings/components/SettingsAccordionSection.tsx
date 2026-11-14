import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface SettingsAccordionSectionProps {
  title: string;
  icon: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Collapsible accordion section container shared by all SettingsModal panels. */
export function SettingsAccordionSection({
  title,
  icon,
  isOpen,
  onToggle,
  children,
}: SettingsAccordionSectionProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 transition-colors dark:border-zinc-800 dark:bg-zinc-900/40">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-800 dark:text-zinc-200"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
        </div>
        {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {isOpen && (
        <div className="space-y-4 border-t border-slate-200 p-4 dark:border-zinc-800">
          {children}
        </div>
      )}
    </div>
  );
}
