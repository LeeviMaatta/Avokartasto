import { ArrowUp, CloudRain, Droplets, Sun, Sunrise, Sunset, Wind } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { formatLocalTime, type ForecastDay, type ForecastHour, type WeatherForecast } from "../weatherService";
import { isTextInputTarget } from "../../settings/model/keyboardShortcuts";

const iconUrl = (icon: string) => `https://openweathermap.org/img/wn/${icon}@2x.png`;
const deg = (value: number) => `${Math.round(value)}°`;
// Forecan tapaan: pakkanen sinisellä, nolla ja plusasteet punaisella.
const tempClass = (value: number) => (Math.round(value) < 0 ? "text-blue-600 dark:text-sky-400" : "text-red-600 dark:text-red-400");
const localHour = (unixSeconds: number, tz: number) => new Date((unixSeconds + tz) * 1000).getUTCHours();

function WindArrow({ deg: windDeg, size = 12, className = "text-gray-500" }: { deg: number; size?: number; className?: string }) {
  // Tuulen suunta kertoo mistä tuulee; nuoli osoittaa puhallussuuntaan.
  return <ArrowUp size={size} className={`shrink-0 ${className}`} style={{ transform: `rotate(${windDeg + 180}deg)` }} aria-label={`Tuulen suunta ${Math.round(windDeg)}°`} />;
}

export default function WeatherForecastView({ forecast }: { forecast: WeatherForecast }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const selected = forecast.days.find((d) => d.key === selectedKey) ?? forecast.days[0];
  const tz = forecast.timezoneOffset;

  useEffect(() => {
    if (forecast.days.length <= 1) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (isTextInputTarget(event.target)) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const modals = document.querySelectorAll('[aria-modal="true"]');
      const myModal = tabListRef.current?.closest('[aria-modal="true"]');
      if (modals.length > 0 && myModal && modals[modals.length - 1] !== myModal) return;

      const currentIdx = Math.max(0, forecast.days.findIndex((d) => d.key === (selected?.key ?? "")));
      const nextIdx =
        event.key === "ArrowLeft"
          ? Math.max(0, currentIdx - 1)
          : Math.min(forecast.days.length - 1, currentIdx + 1);

      event.preventDefault();
      event.stopPropagation();
      const nextDay = forecast.days[nextIdx];
      if (!nextDay) return;
      setSelectedKey(nextDay.key);

      // Siirretään kohdistus seuraavalle välilehdelle vain, jos välilehtipalkki oli jo kohdistettuna
      if (tabListRef.current?.contains(document.activeElement)) {
        const tabs = tabListRef.current.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        tabs[nextIdx]?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [forecast.days, selected?.key]);

  if (!selected) return <div className="py-4 text-center text-sm text-gray-500">Ennustetta ei ole saatavilla.</div>;

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Seuraavat {forecast.days.length} päivää
      </h4>

      {/* Päiväkortit */}
      <div ref={tabListRef} className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Päiväennuste">
        {forecast.days.map((d, i) => {
          const active = d.key === selected.key;
          return (
            <button
              key={d.key}
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedKey(d.key)}
              className={`flex min-w-[68px] flex-1 flex-col items-center rounded-t-lg border-b-4 px-1 pb-1.5 pt-2 text-xs transition ${
                active
                  ? "border-blue-600 bg-blue-50 dark:bg-gray-700"
                  : "border-transparent bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/40 dark:hover:bg-gray-700/70"
              }`}
            >
              <span className="font-semibold capitalize">{i === 0 ? "Tänään" : formatLocalTime(d.time, tz, { weekday: "short" })}</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">{formatLocalTime(d.time, tz, { day: "numeric", month: "numeric" })}</span>
              <img className="-my-1 h-12 w-12" src={iconUrl(d.icon)} alt={d.description} title={d.description} />
              <span className={`text-sm font-bold ${tempClass(d.tempMax)}`}>{deg(d.tempMax)}</span>
              <span className={`text-[11px] ${tempClass(d.tempMin)} opacity-80`}>{deg(d.tempMin)}</span>
              <span className={`mt-0.5 text-[10px] ${d.precipitation >= 0.1 ? "text-blue-600 dark:text-blue-400" : "text-gray-400"}`}>
                {d.precipitation >= 0.1 ? `${d.precipitation.toFixed(1)} mm` : "–"}
              </span>
            </button>
          );
        })}
      </div>

      <DayDetail day={selected} timezoneOffset={tz} source={forecast.source} />

      <p className="mt-2 text-[10px] text-gray-400">
        {forecast.source === "onecall"
          ? "Tuntiennuste 48 h ajalle, sen jälkeen vuorokauden osittain. "
          : "Ennuste 3 tunnin välein (enintään 5 vrk). "}
        Ajat sijainnin paikallista aikaa. Lähde: OpenWeatherMap.
      </p>
    </section>
  );
}

function DayDetail({ day, timezoneOffset: tz, source }: { day: ForecastDay; timezoneOffset: number; source: WeatherForecast["source"] }) {
  return (
    <div className="rounded-b-lg border border-t-0 border-gray-200 dark:border-gray-700" role="tabpanel">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-3 pb-2 pt-3">
        <div>
          <div className="text-2xl font-black uppercase tracking-wider">{formatLocalTime(day.time, tz, { weekday: "long" })}</div>
          <div className="text-sm text-gray-600 dark:text-gray-300">{formatLocalTime(day.time, tz, { day: "numeric", month: "long" })}</div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
          <span className="inline-flex items-center gap-1" title="Kosteus">
            <Droplets size={13} className="text-blue-400" /> {day.humidity} %
          </span>
          {day.uvi !== null && (
            <span className="inline-flex items-center gap-1" title="UV-indeksi">
              <Sun size={13} className="text-amber-500" /> UV {day.uvi.toFixed(1)}
            </span>
          )}
          {day.sunrise !== null && day.sunset !== null && (
            <span className="inline-flex items-center gap-1">
              <Sunrise size={13} className="text-orange-400" /> {formatLocalTime(day.sunrise, tz, { hour: "2-digit", minute: "2-digit" })}
              <Sunset size={13} className="ml-1 text-orange-500" /> {formatLocalTime(day.sunset, tz, { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {day.hours.length > 0 ? (
        <HourList day={day} tz={tz} />
      ) : day.parts ? (
        <PartsList day={day} />
      ) : (
        <div className="py-3 text-center text-xs text-gray-500">Tarkempaa ennustetta ei ole saatavilla tälle päivälle.</div>
      )}
      {day.hours.length > 0 && source === "forecast" && <div className="px-3 py-1 text-[10px] text-gray-400">Ennuste 3 tunnin jaksoissa.</div>}
    </div>
  );
}

const ROW_GRID = "grid grid-cols-[3.25rem_3rem_3.5rem_4rem_1fr] items-center sm:grid-cols-[3.5rem_3.5rem_4.5rem_4.5rem_1fr_4rem]";

function SectionRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-gray-200 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:border-gray-700 dark:text-sky-400">
      <CloudRain size={13} />
      {children}
    </div>
  );
}

function HourList({ day, tz }: { day: ForecastDay; tz: number }) {
  const daytime = day.hours.filter((h) => {
    const hour = localHour(h.time, tz);
    return hour >= 6 && hour < 18;
  });
  const daytimePop = daytime.length > 0 ? Math.max(...daytime.map((h) => h.pop)) : null;
  const firstDaytime = daytime[0]?.time;

  return (
    <div className="border-t border-gray-200 text-sm dark:border-gray-700">
      <SectionRow>
        Vuorokauden sademäärä {day.precipitation.toFixed(1)} mm
      </SectionRow>

      {day.hours.map((h) => (
        <Fragment key={h.time}>
          {h.time === firstDaytime && daytimePop !== null && <SectionRow>Sateen todennäköisyys 06–18: {Math.round(daytimePop * 100)} %</SectionRow>}
          <HourRow hour={h} tz={tz} />
        </Fragment>
      ))}
    </div>
  );
}

function HourRow({ hour: h, tz }: { hour: ForecastHour; tz: number }) {
  return (
    <div className={`${ROW_GRID} border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40`}>
      <span className="self-stretch bg-gradient-to-r from-slate-200 to-transparent py-2 pl-3 text-xs font-semibold dark:from-slate-700">
        <span className="flex h-full items-center">{formatLocalTime(h.time, tz, { hour: "2-digit", minute: "2-digit" })}</span>
      </span>
      <img className="mx-auto h-11 w-11" src={iconUrl(h.icon)} alt={h.description} title={h.description} />
      <span className={`text-center text-lg font-medium ${tempClass(h.temp)}`}>{deg(h.temp)}</span>
      <span className="flex items-center justify-center gap-1">
        <WindArrow deg={h.windDeg} size={16} className="text-lime-600 dark:text-lime-400" />
        <span className="flex flex-col items-center leading-tight">
          <span className="font-medium">{Math.round(h.windSpeed)}</span>
          {h.windGust !== null && <span className="text-[10px] text-gray-500 dark:text-gray-400" title="Puuskat">({Math.round(h.windGust)})</span>}
        </span>
      </span>
      <span className="min-w-0 py-1 pl-2 text-xs leading-snug">
        <span className="block">Tuntuu kuin {deg(h.feelsLike)}</span>
        <span className="block truncate capitalize text-gray-600 dark:text-gray-300" title={h.description}>
          {h.description}
          {h.precipitation >= 0.1 && <span className="ml-1 normal-case text-blue-600 dark:text-sky-400">{h.precipitation.toFixed(1)} mm</span>}
        </span>
      </span>
      <span className="hidden pr-3 text-right text-xs text-gray-600 dark:text-gray-300 sm:block">{h.humidity} %</span>
    </div>
  );
}

function PartsList({ day }: { day: ForecastDay }) {
  if (!day.parts) return null;
  const parts = [
    { label: "Aamu", value: day.parts.morn },
    { label: "Päivä", value: day.parts.day },
    { label: "Ilta", value: day.parts.eve },
    { label: "Yö", value: day.parts.night },
  ];
  return (
    <div className="text-sm">
      <SectionRow>
        Vuorokauden sademäärä {day.precipitation.toFixed(1)} mm · sateen todennäköisyys {Math.round(day.pop * 100)} %
      </SectionRow>
      {parts.map((p) => (
        <div key={p.label} className="grid grid-cols-[4.5rem_3.5rem_4.5rem_1fr] items-center border-b border-gray-200 dark:border-gray-700">
          <span className="self-stretch bg-gradient-to-r from-slate-200 to-transparent py-2 pl-3 text-xs font-semibold dark:from-slate-700">{p.label}</span>
          <img className="mx-auto h-10 w-10" src={iconUrl(day.icon)} alt={day.description} />
          <span className={`text-center text-lg font-medium ${tempClass(p.value)}`}>{deg(p.value)}</span>
          <span className="flex items-center gap-1 pl-2 text-xs text-gray-600 dark:text-gray-300">
            <Wind size={13} className="text-lime-600" /> {Math.round(day.windSpeed)} m/s <WindArrow deg={day.windDeg} />
          </span>
        </div>
      ))}
      <div className="px-3 py-1 text-[10px] text-gray-400">Tuntiennuste ei ole vielä saatavilla tälle päivälle.</div>
    </div>
  );
}
