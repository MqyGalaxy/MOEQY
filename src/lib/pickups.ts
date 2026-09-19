import data from '../data/pickups.json';
import { ui, translations, link, type Lang } from './content';

export interface Pickup {
  id: string; poster: string; video?: string; title: string; category: string;
  status: string; date?: string; description: string; cta: string; href: string;
  titleHref: string; mediaLabel: string; player?: string;
}

export const getPickups = (lang: Lang): Pickup[] => data.map(item => {
  const en = lang === 'en';
  if (item.source === 'original-event') {
    const t = translations[lang];
    return {
      id: item.id, poster: item.poster, video: item.video,
      title: t.index.title, category: t.index.tag.product, date: '2024-02-10', status: '2024.02.10',
      description: t.index.text, cta: ui(lang, 'View the event', '查看活动详情'),
      href: lang === 'ja' ? 'https://blog.moeqy.com/Chinese-New-Year/' : link(lang, en ? 'products/20240210/post-1' : 'chanpin/20240210/post-1'),
      titleHref: 'https://blog.moeqy.com/Chinese-New-Year/',
      mediaLabel: ui(lang, 'Watch the 2023 year-end video', '播放 2023 年终总结视频'),
      player: 'https://player.bilibili.com/player.html?aid=1750606962&bvid=BV1g4421F7VL&cid=1441116004&p=1&high_quality=1&autoplay=0',
    };
  }
  const text = item.text![lang];
  const href = item.href!.startsWith('/') ? link(lang, item.href!) : item.href!;
  return { id: item.id, poster: item.poster, ...text, href, titleHref: href, mediaLabel: text.title };
});
