import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://rcmsar33-oak-bay-conditions.vercel.app',
  output: 'static',
  build: {
    format: 'directory',
  },
});
