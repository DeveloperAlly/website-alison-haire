// YouTube Data API v3 adapter.
// Two-step fetch: handle -> channel ID -> uploads playlist -> items.
// Fails open: returns [] on any error. Talks page falls back to curated JSON.

import type { Video } from '@lib/schemas/video';
import { VideoSchema } from '@lib/schemas/video';

interface YTChannelResponse {
  items?: Array<{
    id: string;
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

interface YTThumbnails {
  maxres?: { url: string };
  high?: { url: string };
  medium?: { url: string };
  default?: { url: string };
}
interface YTPlaylistItem {
  snippet: {
    title: string;
    publishedAt: string;
    resourceId: { videoId: string };
    thumbnails: YTThumbnails;
  };
}
interface YTPlaylistItemsResponse {
  items?: YTPlaylistItem[];
}

interface FetchOpts {
  limit?: number;
}

function bestThumbnail(t: YTThumbnails): string {
  return t.maxres?.url || t.high?.url || t.medium?.url || t.default?.url || '';
}

export async function fetchYoutubeUploads(opts: FetchOpts = {}): Promise<Video[]> {
  const key = import.meta.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;
  const handle = import.meta.env.YOUTUBE_CHANNEL_HANDLE || process.env.YOUTUBE_CHANNEL_HANDLE;
  const limit = opts.limit ?? 8;

  if (!key || !handle) return [];

  try {
    // Step 1: resolve handle (e.g. @DeveloperAlly) to a channel ID + uploads playlist
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${encodeURIComponent(handle)}&key=${key}`
    );
    if (!channelRes.ok) {
      console.warn(`[youtube] channel lookup failed: ${channelRes.status}`);
      return [];
    }
    const channelData = (await channelRes.json()) as YTChannelResponse;
    const uploadsId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) {
      console.warn('[youtube] no uploads playlist found for handle:', handle);
      return [];
    }

    // Step 2: fetch playlist items
    const itemsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${limit}&playlistId=${uploadsId}&key=${key}`
    );
    if (!itemsRes.ok) {
      console.warn(`[youtube] playlist fetch failed: ${itemsRes.status}`);
      return [];
    }
    const items = (await itemsRes.json()) as YTPlaylistItemsResponse;

    return (items.items ?? [])
      .map((it): Video => {
        const videoId = it.snippet.resourceId.videoId;
        return {
          youtubeId: videoId,
          title: it.snippet.title,
          href: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: bestThumbnail(it.snippet.thumbnails),
          publishedAt: it.snippet.publishedAt,
          source: 'youtube' as const,
        };
      })
      .map((v) => VideoSchema.parse(v));
  } catch (err) {
    console.warn('[youtube] fetch failed, returning []:', err instanceof Error ? err.message : err);
    return [];
  }
}
