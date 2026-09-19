import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import type { Lang } from './content';
import { works, type Work } from './works';

export function loadWorkContent(items: Work[], directory = path.resolve('src/content/works')) {
  const content: Record<string, Record<Lang, string>> = {};
  const ids = new Set<string>();
  for (const work of items) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(work.id) || ids.has(work.id)) throw new Error(`Invalid or duplicate work ID: ${work.id}`);
    ids.add(work.id);
    if (!work.enabled) continue;
    const translations = {} as Record<Lang, string>;
    for (const lang of ['zh-CN', 'en', 'ja'] as const) {
      const file = path.join(directory, work.id, `${lang}.md`);
      if (!fs.existsSync(file)) throw new Error(`Missing work introduction: ${file}`);
      const body = fs.readFileSync(file, 'utf8').trim();
      if (!body) throw new Error(`Empty work introduction: ${file}`);
      const html = marked.parse(body, { async: false }) as string;
      if (/<h1\b/i.test(html)) throw new Error(`Work introduction must start at heading level 2: ${file}`);
      translations[lang] = html;
    }
    content[work.id] = translations;
  }
  return content;
}

export const workContent = loadWorkContent(works);
