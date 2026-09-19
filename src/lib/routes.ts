import legacyRoutes from '../data/legacy-routes.json';
import { posts, postsFor, type Lang, type Post } from './content';
import { works, selectWorks, type Work } from './works';
export type Route = { path: string; lang: Lang; slug: string; kind: 'home' | 'archive' | 'article' | 'document' | 'faq' | 'feedback' | 'game' | 'works' | 'work-detail'; post?: Post; work?: Work; };
const paths = new Set(legacyRoutes.map(p => p.replace(/^\/+|\/+$/g, '')).filter(p => p && p !== 'en' && !p.endsWith('.html')));
for (const prefix of ['', 'en/']) {
  for (const slug of ['about','privacy','help/translate','faq','feedback','conceptsgame','archives','pages','categories/work','page/2']) paths.add(prefix+slug);
  for (const post of posts.filter(post => post.lang !== 'ja')) {
    paths.add(prefix+post.slug);
    if (post.category) paths.add(`${prefix}categories/${post.categorySlug}`);
  }
  paths.add(`${prefix}works`);
  for (const work of selectWorks(works)) paths.add(`${prefix}works/${work.id}`);
  const lang = prefix ? 'en' : 'zh-CN';
  for (let i=2; i<=Math.ceil(postsFor(lang).length/10); i++) paths.add(`${prefix}archives/page/${i}`);
}
// Japanese routes contain only Japanese articles, never legacy article mirrors.
for (const slug of ['about','privacy','help/translate','faq','feedback','conceptsgame','archives','pages','categories/work','categories/news','categories/products','works']) paths.add('ja/'+slug);
for (const work of selectWorks(works)) paths.add('ja/works/'+work.id);
for (const post of posts.filter(p=>p.lang==='ja')) {
  paths.add('ja/'+post.slug);
  paths.add('ja/categories/'+post.categorySlug);
  for (const tag of post.tags) paths.add('ja/tags/'+tag);
  paths.add('ja/archives/'+post.date.slice(0,4));
  paths.add('ja/archives/'+post.date.slice(0,7).replace('-','/'));
}
// Content added in the local studio can grow existing archives beyond their old page count.
for (const routePath of [...paths]) {
  const lang: Lang = routePath.startsWith('ja/') ? 'ja' : routePath.startsWith('en/') ? 'en' : 'zh-CN';
  const slug = routePath.replace(/^(en|ja)\//,'');
  if (!/^(archives(?:\/\d{4}(?:\/\d{2})?)?|categories\/[^/]+|tags\/[^/]+)$/.test(slug)) continue;
  const count = archiveData({path:routePath,slug,lang,kind:'archive'}).totalPages;
  for (let page=2;page<=count;page++) paths.add(`${routePath}/page/${page}`);
}
export const routes: Route[] = [...paths].sort().map(path => {
  const lang: Lang = path.startsWith('ja/') ? 'ja' : path.startsWith('en/') ? 'en' : 'zh-CN';
  const slug = path.replace(/^(en|ja)\//,'').replace(/^zh-CN\/?/,'');
  const post = posts.find(p => p.slug === slug);
  const work = selectWorks(works).find(work => slug === `works/${work.id}`);
  const kind = work ? 'work-detail' : slug === 'works' ? 'works' : post ? 'article' : !slug || /^page\/\d+$/.test(slug) ? 'home' : ['about','privacy','help/translate'].includes(slug) ? 'document' : slug === 'faq' ? 'faq' : slug === 'feedback' ? 'feedback' : slug === 'conceptsgame' ? 'game' : 'archive';
  return { path, lang, slug, kind, post, work };
});
export function archiveData(route: Route) {
  const { lang, slug } = route;
  let list = slug === 'pages' && lang !== 'ja' ? [...posts] : postsFor(lang);
  const category = slug.match(/^categories\/([^/]+)/)?.[1];
  const tag = slug.match(/^tags\/([^/]+)/)?.[1];
  const period = slug.match(/^archives\/(\d{4})(?:\/(\d{2}))?/);
  if (category) {
    const categories = category === 'work' ? ['chanpin','products'] : [category];
    list = posts.filter(p => categories.includes(p.categorySlug));
    if (category === 'work' || lang === 'ja') list = list.filter(p => p.lang === lang);
  }
  if (tag) list = list.filter(p => p.tags.includes(tag));
  if (period) list = list.filter(p => p.date.startsWith(period[1]+(period[2] ? '-'+period[2] : '')));
  const count = list.length;
  const pageSize = slug === 'pages' ? Math.max(1,count) : slug.startsWith('archives') || slug.startsWith('tags') ? 6 : 10;
  const totalPages = Math.max(1, Math.ceil(count/pageSize));
  const page = Math.min(totalPages, Number(slug.match(/\/page\/(\d+)/)?.[1] || 1));
  return { posts: list.slice((page-1)*pageSize, page*pageSize), count, page, totalPages, category, tag, period: period ? period[1]+(period[2] ? '.'+period[2] : '') : '', base: slug.replace(/\/page\/\d+$/, '') };
}
