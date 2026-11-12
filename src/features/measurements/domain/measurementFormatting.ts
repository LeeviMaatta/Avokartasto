export const formatArea = (squareMeters: number) =>
  squareMeters >= 1_000_000 ? `${(squareMeters / 1_000_000).toFixed(2)} km²` : `${squareMeters.toFixed(0)} m²`;

export const formatDistance = (meters: number, units: string) => {
  if (units === "imperial") {
    return meters >= 1609.344 ? `${(meters / 1609.344).toFixed(2)} mi` : `${(meters * 3.28084).toFixed(0)} ft`;
  }
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(0)} m`;
};
