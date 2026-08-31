/// <reference types="astro/client" />

interface ImportMetaEnv {
  /**
   * CARTO basemaps API key — carto.com/basemaps/apikey. Public by nature: it is
   * inlined into the client bundle at build time. Kept in env rather than source
   * only so it stays out of this public repo and can be rotated without a commit.
   * Unset is safe — tiles still render, watermarked. See `.env.example`.
   */
  readonly PUBLIC_CARTO_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
