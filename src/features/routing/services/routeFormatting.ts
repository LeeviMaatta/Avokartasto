const OSRM_MODIFIERS_FI: Record<string, string> = {
  left: "vasemmalle",
  right: "oikealle",
  "sharp left": "jyrkästi vasemmalle",
  "sharp right": "jyrkästi oikealle",
  "slight left": "loivasti vasemmalle",
  "slight right": "loivasti oikealle",
  straight: "suoraan",
  uturn: "U-käännös",
};

export function formatOsrmStep(step: {
  maneuver?: { type?: string; modifier?: string; location?: [number, number] };
  name?: string;
}): string {
  const type = step.maneuver?.type ?? "";
  const mod = step.maneuver?.modifier ?? "";
  const road = step.name ? ` tielle ${step.name}` : "";

  if (type === "depart") return `Lähde liikkeelle${road}`;
  if (type === "arrive") return "Saavut määränpäähän";
  if (type === "roundabout" || type === "rotary") return `Aja kiertoliittymästä${road}`;
  const dir = OSRM_MODIFIERS_FI[mod] ? ` ${OSRM_MODIFIERS_FI[mod]}` : "";
  return `Käänny${dir}${road}`.trim();
}

export function formatRouteDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins} min`;
  return mins === 0 ? `${hours} h` : `${hours} h ${mins} min`;
}

export function formatRouteDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
