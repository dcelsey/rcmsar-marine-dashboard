import type { StationConfig } from './stations';
import { haversineKm, type LatLon } from './distance';

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
    time: number[];  // unix ms, normalized in loader
    temperature_2m: number[];
    weather_code: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    wind_direction_10m: number[];
    visibility: (number | null)[];
    precipitation_probability: (number | null)[];
  };
  daily: {
    time: number[];  // unix ms
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
    wind_direction_10m_dominant: number[];
    precipitation_probability_max: (number | null)[];
    sunrise: number[];  // unix ms
    sunset: number[];   // unix ms
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
    time: number[];  // unix ms, normalized in loader
    wave_height_max: (number | null)[];
    wave_direction_dominant?: (number | null)[];
    wave_period_max?: (number | null)[];
  };
};

export type TideEvent = { eventDate: string; value: number };
export type TideBundle = { hilo: TideEvent[]; curve: TideEvent[] };

export type CurrentEventQualifier = 'SLACK' | 'EXTREMA_FLOOD' | 'EXTREMA_EBB';
export type CurrentEvent = { t: number; value: number; qualifier: CurrentEventQualifier };

export type ReferenceCurrentStation = {
  id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
  floodDirection: number | null;
  ebbDirection: number | null;
  events: CurrentEvent[];
};

export type SecondaryCurrentStation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  referenceCode: string;
  floodDirection: number;
  ebbDirection: number;
  events: CurrentEvent[];
  notes?: string;
};

export type CurrentsPayload = {
  generated_at: string;
  tables_edition: string;
  window: { from: string; to: string };
  reference_stations: ReferenceCurrentStation[];
  secondary_stations: SecondaryCurrentStation[];
};

export type LiveWindStation = {
  id: string;
  source: 'swob' | 'ndbc';
  name: string;
  lat: number;
  lon: number;
  elevation_m: number | null;
  obs_time: string;
  wind_dir_deg: number | null;
  wind_speed_kmh: number | null;
  wind_gust_kmh: number | null;
  wind_speed_kn: number | null;
  wind_gust_kn: number | null;
  stale: boolean;
  quality: 'ok' | 'suspect';
};

export type LiveWindPayload = {
  generated_at: string;
  sources: string[];
  station_count: number;
  stations: LiveWindStation[];
};

export type NearbyLiveStation = { station: LiveWindStation; distanceKm: number };

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url.split('?')[0]} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function loadWeather(station: StationConfig): Promise<WeatherResponse> {
  const c = station.center;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}`
    + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl`
    + `&hourly=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,precipitation_probability`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,precipitation_probability_max,sunrise,sunset`
    + `&wind_speed_unit=kn&timezone=${encodeURIComponent(station.tz)}&forecast_days=7&timeformat=unixtime`;
  const data = await getJSON<WeatherResponse>(url);
  data.hourly.time = data.hourly.time.map(t => t * 1000);
  data.daily.time = data.daily.time.map(t => t * 1000);
  data.daily.sunrise = data.daily.sunrise.map(t => t * 1000);
  data.daily.sunset = data.daily.sunset.map(t => t * 1000);
  return data;
}

export async function loadWindByLocation(station: StationConfig): Promise<WindPointResponse[]> {
  const lats = station.points.map(p => p.lat).join(',');
  const lons = station.points.map(p => p.lon).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}`
    + `&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=kn&timezone=${encodeURIComponent(station.tz)}`;
  const data = await getJSON<WindPointResponse | WindPointResponse[]>(url);
  return Array.isArray(data) ? data : [data];
}

export async function loadMarine(station: StationConfig): Promise<MarineResponse> {
  const m = station.marinePoint;
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${m.lat}&longitude=${m.lon}`
    + `&current=wave_height,wave_direction,wave_period,swell_wave_height,wind_wave_height`
    + `&daily=wave_height_max,wave_direction_dominant,wave_period_max&timezone=${encodeURIComponent(station.tz)}&forecast_days=7&timeformat=unixtime`;
  const data = await getJSON<MarineResponse>(url);
  if (data.daily) data.daily.time = data.daily.time.map(t => t * 1000);
  return data;
}

export async function loadLiveWind(): Promise<LiveWindPayload | null> {
  try {
    const res = await fetch(`/data/wind.json?t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json() as LiveWindPayload;
  } catch {
    return null;
  }
}

export function getNearbyLiveStations(
  payload: LiveWindPayload | null,
  center: LatLon,
  { maxKm = 25, limit = 12 }: { maxKm?: number; limit?: number } = {},
): NearbyLiveStation[] {
  if (!payload) return [];
  return payload.stations
    .filter(s => !s.stale && s.quality === 'ok' && s.wind_speed_kn !== null && s.wind_dir_deg !== null)
    .map(s => ({ station: s, distanceKm: haversineKm(center, s) }))
    .filter(e => e.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export function pointHasNearbyLive(
  point: LatLon,
  liveStations: NearbyLiveStation[],
  radiusKm = 5,
): boolean {
  return liveStations.some(l => haversineKm(point, l.station) <= radiusKm);
}

export async function loadCurrents(): Promise<CurrentsPayload | null> {
  try {
    const res = await fetch(`/data/currents.json?t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json() as CurrentsPayload;
  } catch {
    return null;
  }
}

export async function loadTides(station: StationConfig): Promise<TideBundle> {
  if (!station.tideStationId) return { hilo: [], curve: [] };
  const now = new Date();
  const from = new Date(now.getTime() - 6 * 3600e3).toISOString();
  const to   = new Date(now.getTime() + 42 * 3600e3).toISOString();
  const base = `https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/${station.tideStationId}/data`;
  const [hilo, curve] = await Promise.all([
    getJSON<TideEvent[]>(`${base}?time-series-code=wlp-hilo&from=${from}&to=${to}`),
    getJSON<TideEvent[]>(`${base}?time-series-code=wlp&from=${from}&to=${to}`),
  ]);
  return { hilo, curve };
}
