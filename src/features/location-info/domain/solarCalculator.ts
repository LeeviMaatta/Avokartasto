export interface SunTimes {
  sunrise: string;
  sunset: string;
  isPolarDay?: boolean;
  isPolarNight?: boolean;
}

export function getSunTimes(lat: number, lon: number, date: Date = new Date()): SunTimes {
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const zenith = 90.833;
  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;

  const calculateTime = (isSunrise: boolean): number | "polarDay" | "polarNight" => {
    const lngHour = lon / 15;
    const t = dayOfYear + ((isSunrise ? 6 : 18) - lngHour) / 24;
    const M = (0.9856 * t) - 3.289;
    let L = M + (1.916 * Math.sin(M * D2R)) + (0.020 * Math.sin(2 * M * D2R)) + 282.634;
    L = (L + 360) % 360;
    let RA = R2D * Math.atan(0.91764 * Math.tan(L * D2R));
    RA = (RA + 360) % 360;
    const Lquadrant = Math.floor(L / 90) * 90;
    const RAquadrant = Math.floor(RA / 90) * 90;
    RA = RA + (Lquadrant - RAquadrant);
    RA = RA / 15;

    const sinDec = 0.39782 * Math.sin(L * D2R);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(zenith * D2R) - (sinDec * Math.sin(lat * D2R))) / (cosDec * Math.cos(lat * D2R));

    if (cosH > 1) return "polarNight";
    if (cosH < -1) return "polarDay";

    const H = (isSunrise ? (360 - R2D * Math.acos(cosH)) : R2D * Math.acos(cosH)) / 15;
    const T = H + RA - (0.06571 * t) - 6.622;
    return (T - lngHour + 24) % 24;
  };

  const riseUT = calculateTime(true);
  const setUT = calculateTime(false);

  if (riseUT === "polarDay" || setUT === "polarDay") {
    return { sunrise: "–", sunset: "–", isPolarDay: true };
  }
  if (riseUT === "polarNight" || setUT === "polarNight") {
    return { sunrise: "–", sunset: "–", isPolarNight: true };
  }

  const formatUT = (utHours: number): string => {
    const localOffsetMinutes = -date.getTimezoneOffset();
    let totalMinutes = Math.round(utHours * 60 + localOffsetMinutes);
    totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  return {
    sunrise: formatUT(riseUT as number),
    sunset: formatUT(setUT as number),
  };
}
