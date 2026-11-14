export const FORECAST_DAYS = 5;

export interface DetailedWeather {
  temp: number;
  feelsLike: number;
  tempMin: number;
  tempMax: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  windDeg: number;
  clouds: number;
  visibility: number;
  icon: string;
  description: string;
  cityName: string;
}

export interface ForecastHour {
  time: number;
  temp: number;
  feelsLike: number;
  icon: string;
  description: string;
  pop: number;
  precipitation: number;
  windSpeed: number;
  windDeg: number;
  windGust: number | null;
  humidity: number;
}

export interface DayParts {
  morn: number;
  day: number;
  eve: number;
  night: number;
}

export interface ForecastDay {
  key: string;
  time: number;
  tempMin: number;
  tempMax: number;
  icon: string;
  description: string;
  pop: number;
  precipitation: number;
  windSpeed: number;
  windDeg: number;
  humidity: number;
  sunrise: number | null;
  sunset: number | null;
  uvi: number | null;
  /** Vuorokauden osien lämpötilat (vain One Call -päiväennusteessa). */
  parts: DayParts | null;
  hours: ForecastHour[];
}

export interface WeatherForecast {
  /** "onecall" = One Call 3.0 (tunneittain 48 h), "forecast" = 5 vrk / 3 h. */
  source: "onecall" | "forecast";
  /** Sijainnin aikavyöhykkeen siirtymä sekunteina UTC:stä. */
  timezoneOffset: number;
  days: ForecastDay[];
}
