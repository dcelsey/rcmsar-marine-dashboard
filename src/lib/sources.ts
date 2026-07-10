import { CONFIG } from './config';

export type WeatherResponse = {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    wind_direction_10m: number;
    pressure_msl: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    wind_direction_10m: number[];
    visibility: (number | null)[];
    precipitation_probability: (number | null)[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
    wind_direction_10m_dominant: number[];
    precipitation_probability_max: (number | null)[];
    sunrise: string[];
    sunset: string[];
  };
};

export type WindPointResponse = {
  current?: {
    wind_speed_10m: number;
    wind_gusts_10m: number;
    wind_direction_10m: number;
  };
};

export type MarineResponse = {
  current?: {
    wave_height: number | null;
    wave_direction: number | null;
    wave_period: number | null;
    swell_wave_height: number | null;
    wind_wave_height: number | null;
  };
  daily?: {
    time: string[];
    wave_height_max: (number | null)[];
    wave_direction_dominant?: (number | null)[];
    wave_period_max?: (number | null)[];
  };
};

export type TideEvent = { eventDate: string; value: number };
export type TideBundle = { hilo: TideEvent[]; curve: TideEvent[] };

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url.split("?")[0]} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export function loadWeather(): Promise<WeatherResponse> {
  const c = CONFIG.center;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}`
    + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl`
    + `&hourly=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,precipitation_probability`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,precipitation_probability_max,sunrise,sunset`
    + `&wind_speed_unit=kn&timezone=${encodeURIComponent(CONFIG.tz)}&forecast_days=7`;
  return getJSON<WeatherResponse>(url);
}

export async function loadWindByLocation(): Promise<WindPointResponse[]> {
  const lats = CONFIG.points.map(p => p.lat).join(",");
  const lons = CONFIG.points.map(p => p.lon).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}`
    + `&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=kn&timezone=${encodeURIComponent(CONFIG.tz)}`;
  const data = await getJSON<WindPointResponse | WindPointResponse[]>(url);
  return Array.isArray(data) ? data : [data];
}

export function loadMarine(): Promise<MarineResponse> {
  const m = CONFIG.marinePoint;
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${m.lat}&longitude=${m.lon}`
    + `&current=wave_height,wave_direction,wave_period,swell_wave_height,wind_wave_height`
    + `&daily=wave_height_max,wave_direction_dominant,wave_period_max&timezone=${encodeURIComponent(CONFIG.tz)}&forecast_days=7`;
  return getJSON<MarineResponse>(url);
}

export async function loadTides(): Promise<TideBundle> {
  const now = new Date();
  const from = new Date(now.getTime() - 6 * 3600e3).toISOString();
  const to   = new Date(now.getTime() + 42 * 3600e3).toISOString();
  const base = `https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/${CONFIG.tideStationId}/data`;
  const [hilo, curve] = await Promise.all([
    getJSON<TideEvent[]>(`${base}?time-series-code=wlp-hilo&from=${from}&to=${to}`),
    getJSON<TideEvent[]>(`${base}?time-series-code=wlp&from=${from}&to=${to}`),
  ]);
  return { hilo, curve };
}
