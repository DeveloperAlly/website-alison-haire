// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://alisonhaire.com',
  integrations: [react(), mdx(), sitemap()],
  // Static output — fastest, cheapest, deploys cleanly to Cloudflare Pages.
  // API routes live in /functions, which Pages treats as Pages Functions automatically.
  output: 'static',
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    define: {
      // expose build-time env for content adapters
      'import.meta.env.GHOST_URL': JSON.stringify(process.env.GHOST_URL ?? ''),
    },
  },
});
