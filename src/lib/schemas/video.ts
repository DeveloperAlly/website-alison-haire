// Video = unified shape for any video card (YouTube embed or external).

import { z } from 'zod';

export const VideoSchema = z.object({
  youtubeId: z.string().optional(),
  title: z.string(),
  event: z.string().optional(),
  year: z.string().optional(),
  href: z.string(),
  thumbnail: z.string(),
  publishedAt: z.string().optional(),
  source: z.enum(['youtube', 'manual']).default('manual'),
});

export type Video = z.infer<typeof VideoSchema>;
