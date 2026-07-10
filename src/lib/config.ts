export type Point = { name: string; lat: number; lon: number };

export const CONFIG = {
  tz: "America/Vancouver" as const,
  center: { name: "Oak Bay", lat: 48.424, lon: -123.301 } satisfies Point,
  tideStationId: "5cebf1df3d0f4a073c4bbd22",
  points: [
    { name: "Willows Beach", lat: 48.4326, lon: -123.2958 },
    { name: "Cattle Point",  lat: 48.4383, lon: -123.2920 },
    { name: "Discovery Is.", lat: 48.4247, lon: -123.2261 },
    { name: "Kelp Reef",     lat: 48.4573, lon: -123.2385 },
    { name: "Gonzales Pt",   lat: 48.4123, lon: -123.2905 },
    { name: "Harling Pt",    lat: 48.4098, lon: -123.2947 },
    { name: "Trial Is.",     lat: 48.3939, lon: -123.3053 },
    { name: "Victoria Hbr",  lat: 48.4235, lon: -123.3880 },
    { name: "Dallas Rd",     lat: 48.4085, lon: -123.3520 },
  ] satisfies Point[],
  marinePoint: { name: "Haro Strait", lat: 48.44, lon: -123.24 } satisfies Point,
  refreshMs: 10 * 60 * 1000,
};
