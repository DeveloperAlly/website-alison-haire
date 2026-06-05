// Wrapper that fetches a content entry and throws if missing.
// Build fails loudly instead of silently rendering empty sections.
//
// Usage:
//   const site = await loadSite();
//   const projects = await loadProjects();

import { getEntry } from 'astro:content';

async function load<T>(collection: any, slug: string): Promise<T> {
  const entry = await getEntry(collection, slug);
  if (!entry) {
    throw new Error(`Missing required content entry: ${String(collection)}/${slug}`);
  }
  return entry as T;
}

export const loadSite         = () => load<import('astro:content').CollectionEntry<'site'>>('site', 'index');
export const loadProjects     = () => load<import('astro:content').CollectionEntry<'projects'>>('projects', 'index');
export const loadTalks        = () => load<import('astro:content').CollectionEntry<'talks'>>('talks', 'index');
export const loadPodcasts     = () => load<import('astro:content').CollectionEntry<'podcasts'>>('podcasts', 'index');
export const loadPublications = () => load<import('astro:content').CollectionEntry<'publications'>>('publications', 'index');
export const loadExperience   = () => load<import('astro:content').CollectionEntry<'experience'>>('experience', 'index');
export const loadAllyContext  = () => load<import('astro:content').CollectionEntry<'ally'>>('ally', 'context');
