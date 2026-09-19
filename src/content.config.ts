import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
export const collections = {
  posts: defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/posts' }) }),
};
