import { useEffect, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { X } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";

export default function StreetViewPanel() {
  const tool = useMapStore((s) => s.tool);
  const pos = useMapStore((s) => s.streetViewPos);
  const key = useMapStore((s) => s.settings.googleKey);
  const box = useRef<HTMLDivElement>(null);
  const pano = useRef<google.maps.StreetViewPanorama | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (tool !== "streetview" || !key || !pos || !box.current) return;
    let cancelled = false;
    new Loader({ apiKey: key, version: "weekly" })
      .importLibrary("streetView")
      .then(({ StreetViewPanorama }) => {
        if (cancelled || !box.current) return;
        if (!pano.current) pano.current = new StreetViewPanorama(box.current, { position: pos, pov: { heading: 0, pitch: 0 } });
        else pano.current.setPosition(pos);
        setErr("");
      })
      .catch((e) => setErr(String(e)));
    return () => {
      cancelled = true;
    };
  }, [tool, pos, key]);

  useEffect(() => {
    if (tool !== "streetview") pano.current = null;
  }, [tool]);

  if (tool !== "streetview") return null;
  return (
    <div className="absolute bottom-3 right-3 top-16 z-10 flex w-[420px] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-semibold">
        Street View
        <button onClick={() => useMapStore.setState({ tool: "none" })}><X size={16} /></button>
      </div>
      {!key && <p className="p-3 text-sm text-red-600">Lisää Google API -avain asetuksissa.</p>}
      {key && !pos && <p className="p-3 text-sm text-gray-600">Klikkaa karttaa valitaksesi sijainnin.</p>}
      {err && <p className="p-3 text-sm text-red-600">{err}</p>}
      <div ref={box} className="min-h-0 flex-1" />
    </div>
  );
}
