import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { X } from "lucide-react";
import { useMapStore } from "../../store/mapStore";

export default function ElevationChart() {
  const profile = useMapStore((s) => s.profile);
  const error = useMapStore((s) => s.profileError);
  const measure = useMapStore((s) => s.measure);
  if (!profile && !error) return null;

  const data = profile?.map((p) => ({ km: +(p.dist / 1000).toFixed(2), elev: p.elev })) ?? [];
  const valid = data.filter((d) => d.elev !== null).map((d) => d.elev as number);
  let up = 0, down = 0;
  for (let i = 1; i < data.length; i++) {
    const a = data[i - 1].elev, b = data[i].elev;
    if (a !== null && b !== null) (b > a ? (up += b - a) : (down += a - b));
  }

  return (
    <div className="absolute bottom-3 left-1/2 z-10 h-52 w-[min(800px,60vw)] -translate-x-1/2 rounded-lg bg-white/95 p-3 shadow-xl">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold">
          Korkeusprofiili{measure ? ` – ${(measure.length / 1000).toFixed(2)} km` : ""}
          {valid.length > 0 && ` · min ${Math.round(Math.min(...valid))} m · max ${Math.round(Math.max(...valid))} m · nousu ${Math.round(up)} m · lasku ${Math.round(down)} m`}
        </span>
        <button onClick={() => useMapStore.setState({ profile: null, profileError: null })}><X size={14} /></button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : (
        <ResponsiveContainer width="100%" height="85%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="km" unit=" km" fontSize={11} />
            <YAxis unit=" m" fontSize={11} domain={["auto", "auto"]} />
            <Tooltip />
            <Area type="monotone" dataKey="elev" name="Korkeus (m)" stroke="#2563eb" fill="#93c5fd" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
