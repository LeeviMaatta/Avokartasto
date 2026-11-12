export const formatArea = (squareMeters: number, areaUnit = "auto") => {
  if (areaUnit === "ha") {
    return `${(squareMeters / 10_000).toFixed(2)} ha`;
  }
  if (areaUnit === "m2") {
    return `${Math.round(squareMeters).toLocaleString("fi-FI")} m²`;
  }
  if (areaUnit === "km2") {
    return `${(squareMeters / 1_000_000).toFixed(3)} km²`;
  }
  if (squareMeters >= 1_000_000) {
    return `${(squareMeters / 1_000_000).toFixed(2)} km²`;
  }
  if (squareMeters >= 10_000) {
    return `${(squareMeters / 10_000).toFixed(2)} ha`;
  }
  return `${squareMeters.toFixed(0)} m²`;
};

export const formatDistance = (meters: number, units: string) => {
  if (units === "imperial") {
    return meters >= 1609.344 ? `${(meters / 1609.344).toFixed(2)} mi` : `${(meters * 3.28084).toFixed(0)} ft`;
  }
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(0)} m`;
};
