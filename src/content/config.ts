// Astro Content Collections + Zod schemas.
// One file = one place where every piece of content's shape is defined.
// Validates JSON/MDX at build time; the build fails if a field is missing or mistyped.
//
// Adding a new content type:
//   1. Define its schema below.
//   2. Register it in `collections`.
//   3. Create the JSON/MDX in src/content/<name>/.

import { defineCollection, z } from 'astro:content';

// ----------------------------------------------------------------------------
// Shared primitives
// ----------------------------------------------------------------------------

const urlSchema = z.string().url().or(z.literal('#'));

const thumbnailSchema = z
  .object({
    src: z.string(),
    alt: z.string().default(''),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .or(z.string()); // allow plain URL string for convenience

// ----------------------------------------------------------------------------
// site.json — copy, links, stats, eras
// ----------------------------------------------------------------------------

const siteCollection = defineCollection({
  type: 'data',
  schema: z.object({
    seo: z.object({
      title: z.string(),
      description: z.string(),
      ogImage: z.string().optional(),
    }),
    hero: z.object({
      eyebrow: z.string(),
      headlinePrefix: z.string(),
      headlineEmphasis: z.string(),
      lead: z.string(),
      ctaPrimary: z.object({ label: z.string(), href: z.string(), icon: z.string() }),
      ctaSecondary: z.object({ label: z.string(), href: z.string(), icon: z.string() }),
    }),
    bio: z.object({
      headline: z.string(),
      paragraphs: z.array(z.string()),
    }),
    interests: z.object({
      eyebrow: z.string(),
      headline: z.string(),
      body: z.string(),
      tags: z.array(z.tuple([z.string(), z.string()])), // [icon, label]
    }),
    stats: z.array(z.tuple([z.string(), z.string()])), // [number, label]
    eras: z.array(
      z.object({
        name: z.string(),
        span: z.string(),
        now: z.boolean().optional(),
      })
    ),
    links: z.record(z.string()),
    pages: z.array(z.tuple([z.string(), z.string()])), // [label, href]
  }),
});

// ----------------------------------------------------------------------------
// projects.json
// ----------------------------------------------------------------------------

const projectsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    items: z.array(
      z.object({
        name: z.string(),
        status: z.enum(['shipped', 'oss', 'research', 'wip']),
        desc: z.string(),
        tags: z.array(z.string()),
        href: urlSchema,
        thumbnail: thumbnailSchema.optional(),
      })
    ),
  }),
});

// ----------------------------------------------------------------------------
// talks.json — featured + curated (hybrid YouTube model)
// ----------------------------------------------------------------------------

const talksCollection = defineCollection({
  type: 'data',
  schema: z.object({
    featured: z.object({
      event: z.string(),
      title: z.string(),
      year: z.string(),
      desc: z.string(),
      href: urlSchema,
      youtubeId: z.string().optional(),
      thumbnail: thumbnailSchema.optional(),
    }),
    curated: z.array(
      z.object({
        event: z.string(),
        year: z.string(),
        title: z.string(),
        href: urlSchema,
        youtubeId: z.string().optional(),
        thumbnail: thumbnailSchema.optional(),
      })
    ),
    // Auto-fetched recent videos populate at build time; this is the fallback shape.
    autoFetchLimit: z.number().int().nonnegative().default(8),
  }),
});

// ----------------------------------------------------------------------------
// podcasts.json
// ----------------------------------------------------------------------------

const podcastsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    host: z.object({
      show: z.string(),
      title: z.string(),
      date: z.string(),
      href: urlSchema,
    }),
    guest: z.array(
      z.object({
        show: z.string(),
        title: z.string(),
        date: z.string(),
        href: urlSchema,
      })
    ),
  }),
});

// ----------------------------------------------------------------------------
// publications.json — external writing outlets + manual featured articles
// ----------------------------------------------------------------------------

const publicationsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    outlets: z.array(
      z.object({
        name: z.string(),
        note: z.string(),
        href: urlSchema,
      })
    ),
    fallbackPosts: z.array(
      z.object({
        tag: z.string(),
        title: z.string(),
        excerpt: z.string(),
        date: z.string(),
        read: z.string().optional(),
        href: urlSchema,
        thumbnail: thumbnailSchema.optional(),
      })
    ),
  }),
});

// ----------------------------------------------------------------------------
// experience.json — CV section
// ----------------------------------------------------------------------------

const experienceCollection = defineCollection({
  type: 'data',
  schema: z.object({
    roles: z.array(
      z.object({
        when: z.string(),
        where: z.string(),
        role: z.string(),
        company: z.string(),
        desc: z.string(),
      })
    ),
    skills: z.array(z.tuple([z.string(), z.array(z.string())])),
    education: z.array(
      z.object({
        deg: z.string(),
        school: z.string(),
        years: z.string(),
        note: z.string().optional(),
      })
    ),
    recognition: z.array(z.string()),
  }),
});

// ----------------------------------------------------------------------------
// ally — CAG context bundle (markdown)
// ----------------------------------------------------------------------------

const allyCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    voice: z.string().optional(),
  }),
});

// ----------------------------------------------------------------------------

export const collections = {
  site: siteCollection,
  projects: projectsCollection,
  talks: talksCollection,
  podcasts: podcastsCollection,
  publications: publicationsCollection,
  experience: experienceCollection,
  ally: allyCollection,
};
