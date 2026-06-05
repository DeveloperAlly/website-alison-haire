// Ghost Content API adapter.
// Pure function: env in, Post[] out. Fails open — returns [] on any error so the build still succeeds.
// Consumers (writing page, hero feed) decide whether to fall back to manual posts.

import type { Post } from '@lib/schemas/post';
import { PostSchema } from '@lib/schemas/post';

interface GhostPost {
  title: string;
  excerpt?: string;
  custom_excerpt?: string;
  published_at?: string;
  reading_time?: number;
  url: string;
  feature_image?: string;
  tags?: Array<{ name: string }>;
}

interface GhostResponse {
  posts: GhostPost[];
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

interface FetchOpts {
  limit?: number;
}

export async function fetchGhostPosts(opts: FetchOpts = {}): Promise<Post[]> {
  const url = import.meta.env.GHOST_URL || process.env.GHOST_URL;
  const key = import.meta.env.GHOST_CONTENT_API_KEY || process.env.GHOST_CONTENT_API_KEY;
  const limit = opts.limit ?? 6;

  if (!url || !key) {
    return [];
  }

  const endpoint =
    `${url.replace(/\/$/, '')}/ghost/api/content/posts/` +
    `?key=${encodeURIComponent(key)}` +
    `&limit=${limit}` +
    `&include=tags` +
    `&fields=title,excerpt,custom_excerpt,published_at,reading_time,url,feature_image`;

  try {
    const res = await fetch(endpoint, { headers: { 'accept-version': 'v5.0' } });
    if (!res.ok) {
      console.warn(`[ghost] non-ok response: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = (await res.json()) as GhostResponse;
    if (!Array.isArray(data.posts)) return [];

    return data.posts
      .map((p): Post => ({
        tag: (p.tags && p.tags[0]?.name) || 'Post',
        title: p.title,
        excerpt: p.custom_excerpt || p.excerpt || '',
        date: fmtDate(p.published_at),
        read: p.reading_time ? `${p.reading_time} min` : undefined,
        href: p.url,
        thumbnail: p.feature_image,
        source: 'ghost' as const,
      }))
      .map((p) => PostSchema.parse(p));
  } catch (err) {
    console.warn('[ghost] fetch failed, returning []:', err instanceof Error ? err.message : err);
    return [];
  }
}
