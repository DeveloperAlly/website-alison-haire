// Post = the unified shape for any written content card on the site.
// Both Ghost-fetched posts and JSON fallback posts conform to this shape.

import { z } from 'zod';

export const PostSchema = z.object({
  tag: z.string(),
  title: z.string(),
  excerpt: z.string(),
  date: z.string(),
  read: z.string().optional(),
  href: z.string(),
  thumbnail: z.string().optional(),
  source: z.enum(['ghost', 'manual']).default('manual'),
});

export type Post = z.infer<typeof PostSchema>;
