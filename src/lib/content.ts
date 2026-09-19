import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { marked } from 'marked';
import zh from '../data/zh-CN.yml?raw';
import en from '../data/en.yml?raw';
import ja from '../data/ja.yml?raw';
import legacyHtml from '../data/legacy-post-html.json';
import legacyHashes from '../data/legacy-post-hashes.json';
import legacyBodyHashes from '../data/legacy-post-body-hashes.json';
import { defaultPostCover, postCovers } from '../data/post-covers';

export const liveLanguages = ['zh-CN', 'en', 'ja'] as const;
export type Lang = typeof liveLanguages[number];
export const translations = { 'zh-CN': parse(zh), en: parse(en), ja: parse(ja) };
export function ui(lang: Lang, english: string, chinese: string, key = english): string {
  const value = translations[lang].ui?.[key];
  if (typeof value === 'string') return value;
  if (lang === 'ja') throw new Error(`Missing Japanese UI translation: ${key}`);
  return lang === 'en' ? english : chinese;
}
export const prefix = (lang: Lang) => lang === 'zh-CN' ? '' : `/${lang}`;
export const link = (lang: Lang, route = '') => `${prefix(lang)}/${route.replace(/^\/|\/$/g, '')}${route && !route.endsWith('.html') ? '/' : ''}`;
export interface Post { slug: string; title: string; date: string; dateTime: string; listed: boolean; lang: Lang; category: string; categorySlug: string; tags: string[]; html: string; excerpt: string; cover: string; translationKey?: string | null; }
const root = path.resolve('src/content/posts');
function files(dir: string): string[] { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
export const posts: Post[] = files(root).filter(f => f.endsWith('.md')).flatMap<Post>(file => {
  const raw = fs.readFileSync(file, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)!;
  const data = parse(match[1]);
  if (data.draft === true) return [];
  const language = data.lang || data.language || 'zh-CN';
  if (!liveLanguages.includes(language)) throw new Error(`Language ${language} is not live; save ${file} as a draft first.`);
  const body = match[2];
  const category = data.categories?.[0] || '';
  const slug = path.relative(root, file).replaceAll('\\', '/').replace(/\.md$/, '');
  const unchanged = (legacyHashes as Record<string,string>)[slug] === createHash('sha256').update(raw).digest('hex') ||
    (legacyBodyHashes as Record<string,string>)[slug] === createHash('sha256').update(body.replaceAll('\r\n','\n')).digest('hex');
  const rendered = unchanged ? (legacyHtml as Record<string,string>)[slug] : marked.parse(body.replace('<!--more-->', '<span id="more"></span>'), { breaks: true, async: false }) as string;
  const html = rendered.replace(/<(\/?)h([1-6])\b/g, (_, closing: string, level: string) => `<${closing}h${Math.min(Number(level)+1,6)}`);
  return { slug, title: data.title, translationKey: data.translationKey, cover: data.cover || postCovers[slug] || defaultPostCover,
    date: String(data.date).slice(0, 10).replaceAll('/', '-'), dateTime: String(data.date).replaceAll('/', '-'), listed: Boolean(data.lang), lang: data.lang || data.language || 'zh-CN', category,
    categorySlug: ({ '公告': 'gonggao', '产品': 'chanpin', News: 'news', Products: 'products', 'お知らせ': 'news', '作品': 'products' } as Record<string, string>)[category] || 'uncategorized',
    tags: (data.tag || data.tags || []).map(String), html,
    excerpt: (marked.parse(body.split('<!--more-->')[0], { async: false }) as string).replace(/<[^>]*>/g, '').trim(),
  };
}).sort((a,b) => b.dateTime.localeCompare(a.dateTime) || a.slug.localeCompare(b.slug));
export const postsFor = (lang: Lang) => posts.filter(p => p.lang === lang && p.listed);
export const postLink = (post: Post, lang: Lang = post.lang) => link(lang, post.slug);
export function alternateSlug(slug: string, lang: Lang) {
  const source = posts.find(post => post.slug === slug);
  if (source?.lang === lang) return source.slug;
  if (source?.translationKey) {
    const translation = posts.find(post => post.translationKey === source.translationKey && post.lang === lang);
    return translation ? translation.slug : 'archives';
  }
  if (source && (source.translationKey !== undefined || lang === 'ja' || source.lang === 'ja')) return 'archives';
  if (lang === 'zh-CN' && /^categories\/(news|products)$/.test(slug)) return slug.replace('/news', '/gonggao').replace('/products', '/chanpin');
  if (lang === 'en' && /^categories\/(gonggao|chanpin)$/.test(slug)) return slug.replace('/gonggao', '/news').replace('/chanpin', '/products');
  if (lang === 'ja' && /^(archives\/|pages$|tags\/|page\/)/.test(slug)) return 'archives';
  if (lang === 'ja') return slug.replace(/^categories\/gonggao$/, 'categories/news').replace(/^categories\/chanpin$/, 'categories/products');
  return lang === 'en' ? slug.replace(/^gonggao\/(20230808|20231110|20250708)/, 'news/$1').replace(/^chanpin\//, 'products/') : slug.replace(/^news\//, 'gonggao/').replace(/^products\//, 'chanpin/');
}
