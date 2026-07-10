export type Point = { name: string; lat: number; lon: number };

export type WebcamIframe = {
  kind: 'iframe';
  title: string;
  src: string;
  sourceHref: string;
  modal?: boolean;
};

export type WebcamLink = {
  kind: 'link';
  title: string;
  ctaTitle: string;
  ctaSubtitle: string;
  href: string;
  note?: string;
};

export type Webcam = WebcamIframe | WebcamLink;

export type EcccZone = { label: string; siteId: string; mapId: string };
export type DeepDiveLink = { label: string; href: string };

export type StationConfig = {
  slug: string;
  brand: {
    short: string;
    tagline: string;
    logoSrc: string;
    logoAlt: string;
    faviconSrc: string;
    appleTouchIconSrc: string;
    accent: string;
    themeColor: string;
  };
  meta: {
    title: string;
    description: string;
    footerCredit: string;
  };
  labels: {
    windSub: string;
    seaSub: string;
    tideSub: string;
    tideCardHeading: string;
    sunFootnote: string;
    forecastLocation: string;
    marineWarningLocation: string;
  };
  tz: string;
  center: Point;
  tideStationId: string;
  points: Point[];
  marinePoint: Point;
  refreshMs: number;
  eccc: EcccZone[];
  windy: { lat: number; lon: number; zoom: number };
  webcams: Webcam[];
  deepDive: DeepDiveLink[];
};

export const STATIONS = {
  sar33: {
    slug: 'sar33',
    brand: {
      short: 'RCMSAR 33 · Oak Bay',
      tagline: 'Local Marine Conditions',
      logoSrc: '/stations/sar33/logo.png',
      logoAlt: 'RCMSAR 33 Oak Bay Sea Rescue Society',
      faviconSrc: '/stations/sar33/favicon.png',
      appleTouchIconSrc: '/stations/sar33/apple-touch-icon.png',
      accent: '#37b6ff',
      themeColor: '#0b1622',
    },
    meta: {
      title: 'RCMSAR 33 Oak Bay — Local Conditions',
      description: 'RCMSAR Unit 33 Oak Bay local marine conditions dashboard for wind, weather, tides, and sea state.',
      footerCredit: 'RCMSAR 33 Oak Bay conditions',
    },
    labels: {
      windSub: 'Oak Bay',
      seaSub: 'Haro Strait',
      tideSub: 'Station 07130',
      tideCardHeading: 'Tide — Oak Bay (07130)',
      sunFootnote: 'Computed locally (SunCalc) for Oak Bay.',
      forecastLocation: 'Oak Bay',
      marineWarningLocation: 'Oak Bay',
    },
    tz: 'America/Vancouver',
    center: { name: 'Oak Bay', lat: 48.424, lon: -123.301 },
    tideStationId: '5cebf1df3d0f4a073c4bbd22',
    points: [
      { name: 'Willows Beach', lat: 48.4326, lon: -123.2958 },
      { name: 'Cattle Point',  lat: 48.4383, lon: -123.2920 },
      { name: 'Discovery Is.', lat: 48.4247, lon: -123.2261 },
      { name: 'Kelp Reef',     lat: 48.4573, lon: -123.2385 },
      { name: 'Gonzales Pt',   lat: 48.4123, lon: -123.2905 },
      { name: 'Harling Pt',    lat: 48.4098, lon: -123.2947 },
      { name: 'Trial Is.',     lat: 48.3939, lon: -123.3053 },
      { name: 'Victoria Hbr',  lat: 48.4235, lon: -123.3880 },
      { name: 'Dallas Rd',     lat: 48.4085, lon: -123.3520 },
    ],
    marinePoint: { name: 'Haro Strait', lat: 48.44, lon: -123.24 },
    refreshMs: 10 * 60 * 1000,
    eccc: [
      { label: 'Haro Strait', siteId: '06100', mapId: '02' },
      { label: 'Juan de Fuca Strait — east entrance', siteId: '07003', mapId: '02' },
    ],
    windy: { lat: 48.424, lon: -123.28, zoom: 11 },
    webcams: [
      {
        kind: 'iframe',
        title: 'Dallas Road webcam',
        src: 'https://mds.multivista.com/index.cfm?fuseaction=aPublicWebcam.embed&WebcamPublicEmbedUID=8E2F0FF9-3D83-4193-ABA5-3B90D4AC4006&HLS=1&width=1024&height=576&background=none',
        sourceHref: 'https://windisgood.com/dallas-road-webcam-live.html',
        modal: true,
      },
      {
        kind: 'link',
        title: 'Willows Beach webcam',
        ctaTitle: 'Open Willows Beach webcam',
        ctaSubtitle: 'Opens the WindIsGood webcam page ↗',
        href: 'https://windisgood.com/willows-beach.html',
        note: 'The direct image URL is blocked by the source site, so this opens the official webcam page instead.',
      },
      {
        kind: 'link',
        title: 'Ross Bay webcam',
        ctaTitle: 'Open Ross Bay webcam',
        ctaSubtitle: 'Video owner has disabled embedding ↗',
        href: 'https://windisgood.com/ross-bay-webcam-live.html',
        note: 'The YouTube video (via camstreamer) blocks external embeds, so this opens the source page instead.',
      },
    ],
    deepDive: [
      { label: 'WindIsGood — Island map ↗',        href: 'https://windisgood.com/island-map2.html' },
      { label: 'WindIsGood — Willows Beach ↗',     href: 'https://windisgood.com/willows-beach.html' },
      { label: 'WindIsGood — Dallas Road ↗',       href: 'https://windisgood.com/dallas-road.html' },
      { label: 'Windy.com full ↗',                 href: 'https://www.windy.com/?48.434,-123.169,11' },
      { label: 'Weather Network — hourly ↗',       href: 'https://www.theweathernetwork.com/en/city/ca/british-columbia/oak-bay/hourly' },
      { label: 'DFO tides — 07130 ↗',              href: 'https://www.tides.gc.ca/en/stations/07130' },
    ],
  } satisfies StationConfig,
} as const;

export type StationSlug = keyof typeof STATIONS;
export const stationList = (): StationConfig[] => Object.values(STATIONS);
export const stationSlugs = (): StationSlug[] => Object.keys(STATIONS) as StationSlug[];
export const getStation = (slug: string): StationConfig => {
  const s = (STATIONS as Record<string, StationConfig>)[slug];
  if (!s) throw new Error(`Unknown station: ${slug}`);
  return s;
};
