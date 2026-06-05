/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly GHOST_URL: string;
  readonly GHOST_CONTENT_API_KEY: string;
  readonly YOUTUBE_API_KEY: string;
  readonly YOUTUBE_CHANNEL_HANDLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
