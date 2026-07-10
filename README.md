# RCMSAR 33 · Oak Bay — Local Conditions Dashboard

A polished, single-page dashboard for RCMSAR Unit 33 (Oak Bay) that shows wind, weather, sea state, visibility, tide, and sun/twilight for the local operating area. It is fully client-side and ready for simple static hosting such as Vercel.

## What’s included
- Current conditions plus hourly and 7-day outlooks
- Wind by location across the operating area
- Tide predictions and a tide curve
- Sun, twilight, and moon phase information
- Embedded Windy map and ECCC forecast links

## Files
- [index.html](index.html) — the deployment-ready dashboard entrypoint
- [prototype.html](prototype.html) — the original self-contained prototype
- [SPEC.md](SPEC.md) — implementation notes, data sources, and architecture details

## Local preview
Run a local static server from this folder:

```bash
python -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Deploy to Vercel
This project is already structured for Vercel static hosting:

1. Create a private Git repository and push this folder.
2. Import the repository in Vercel.
3. Use the repository root as the project root.
4. No build step, API keys, or environment variables are required.

## Notes
The dashboard displays observed and forecast values only. It does not make operational go/no-go decisions. Always confirm against the official ECCC marine forecast before tasking.
