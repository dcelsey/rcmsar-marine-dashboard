export const fmtTime = (iso: string | number | Date, tz: string): string =>
  new Date(iso).toLocaleTimeString('en-CA', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  });

export const fmtDay = (iso: string | number | Date, tz: string): string =>
  new Date(iso).toLocaleDateString('en-CA', {
    timeZone: tz, weekday: 'short',
  });

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'] as const;
export const compass = (deg: number): string => COMPASS[Math.round(((deg % 360) / 22.5)) % 16]!;

const WMO_MAP: Record<number, [string, string]> = {
  0:  ['☀️', 'Clear'],
  1:  ['🌤', 'Mainly clear'],
  2:  ['⛅', 'Partly cloudy'],
  3:  ['☁️', 'Overcast'],
  45: ['🌫', 'Fog'],
  48: ['🌫', 'Rime fog'],
  51: ['🌦', 'Light drizzle'],
  53: ['🌦', 'Drizzle'],
  55: ['🌧', 'Dense drizzle'],
  56: ['🌧', 'Freezing drizzle'],
  57: ['🌧', 'Freezing drizzle'],
  61: ['🌦', 'Light rain'],
  63: ['🌧', 'Rain'],
  65: ['🌧', 'Heavy rain'],
  66: ['🌧', 'Freezing rain'],
  67: ['🌧', 'Freezing rain'],
  71: ['🌨', 'Light snow'],
  73: ['🌨', 'Snow'],
  75: ['❄️', 'Heavy snow'],
  77: ['🌨', 'Snow grains'],
  80: ['🌦', 'Light showers'],
  81: ['🌧', 'Showers'],
  82: ['⛈', 'Violent showers'],
  85: ['🌨', 'Snow showers'],
  86: ['🌨', 'Snow showers'],
  95: ['⛈', 'Thunderstorm'],
  96: ['⛈', 'Storm w/ hail'],
  99: ['⛈', 'Storm w/ hail'],
};
export const wmo = (code: number): [string, string] => WMO_MAP[code] ?? ['·', '—'];

export const fmtNow = (tz: string): string =>
  new Date().toLocaleTimeString('en-CA', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  });
