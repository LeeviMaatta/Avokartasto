import { useEffect, useState } from "react";
import type { UiStyle } from "../features/settings/model/settingTypes";

interface LoadingScreenProps {
  loading: boolean;
  uiStyle?: UiStyle;
  theme?: string;
}

export default function LoadingScreen({
  loading,
  uiStyle = "modern",
  theme = "light",
}: LoadingScreenProps) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [progress, setProgress] = useState(15);
  const [statusText, setStatusText] = useState("Käynnistetään sovellusta...");

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setProgress(45);
      setStatusText("Alustetaan karttatasoja...");
    }, 250);

    const timer2 = setTimeout(() => {
      setProgress(80);
      setStatusText("Ladataan merkintöjä ja asetuksia...");
    }, 600);

    const timer3 = setTimeout(() => {
      setProgress(100);
      setStatusText("Valmis");
    }, 950);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      setProgress(100);
      setStatusText("Valmis");
      let hideTimer: ReturnType<typeof setTimeout> | undefined;
      const fadeTimer = setTimeout(() => {
        setFading(true);
        hideTimer = setTimeout(() => {
          setVisible(false);
        }, 300);
      }, 100);
      return () => {
        clearTimeout(fadeTimer);
        if (hideTimer !== undefined) clearTimeout(hideTimer);
      };
    }
  }, [loading]);

  if (!visible) return null;

  const isDark = theme === "dark";
  const isRetro = uiStyle === "retro";

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-300 select-none ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      } ${
        isRetro
          ? isDark
            ? "bg-[#18181b] text-[#f4f4f5] font-mono"
            : "bg-[#c0c0c0] text-black font-mono"
          : isDark
          ? "bg-[#09090b] text-zinc-100"
          : "bg-[#f8fafc] text-slate-900"
      }`}
    >
      <div className="flex w-64 max-w-[calc(100vw-2rem)] flex-col items-center text-center">
        <h1
          className={`text-sm font-semibold tracking-wider uppercase ${
            isRetro ? "tracking-normal" : ""
          }`}
        >
          Avokartasto
        </h1>

        <p
          className={`mt-1.5 mb-4 text-xs ${
            isRetro
              ? "opacity-80"
              : isDark
              ? "text-zinc-400"
              : "text-slate-500"
          }`}
        >
          {statusText}
        </p>

        {isRetro ? (
          <div
            className={`w-full p-0.5 border-2 ${
              isDark
                ? "border-t-black border-l-black border-r-[#555] border-b-[#555] bg-black"
                : "border-t-[#808080] border-l-[#808080] border-r-white border-b-white bg-white"
            }`}
          >
            <div
              className={`h-3 transition-all duration-300 ${
                isDark ? "bg-blue-500" : "bg-[#000080]"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : (
          <div
            className={`h-1.5 w-full overflow-hidden rounded-full ${
              isDark ? "bg-zinc-800" : "bg-slate-200"
            }`}
          >
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <span
          className={`mt-2 text-[11px] font-mono ${
            isRetro
              ? "opacity-75"
              : isDark
              ? "text-zinc-500"
              : "text-slate-400"
          }`}
        >
          {progress}%
        </span>
      </div>
    </div>
  );
}
