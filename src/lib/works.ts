import data from '../data/works.json';
import { link, type Lang } from './content';

export interface WorkText {
  title: string;
  subtitle?: string;
  category: string;
  description: string;
  cta: string;
}
export interface Work {
  id: string;
  enabled: boolean;
  homeFeatured?: boolean;
  pageFeatured?: boolean;
  href: string;
  cover: string;
  logo?: string;
  text: { 'zh-CN': WorkText; en?: WorkText; ja?: WorkText };
}
export const works: Work[] = data;
export const selectWorks = (items: Work[], placement: 'all' | 'home' | 'page' = 'all') =>
  items.filter(work => work.enabled && (placement === 'all' || work[placement === 'home' ? 'homeFeatured' : 'pageFeatured'] === true));
export const workText = (work: Work, lang: Lang) => work.text[lang] || work.text['zh-CN'];
export const workLink = (work: Work, lang: Lang) => work.href.startsWith('/') ? link(lang, work.href) : work.href;
export const workDetailLink = (work: Work, lang: Lang) => link(lang, `works/${work.id}`);
