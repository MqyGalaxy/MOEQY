import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {parse} from 'yaml';
import {marked} from 'marked';
import {load} from 'cheerio';
import {createStore} from './studio-store.mjs';

const read=file=>fs.readFileSync(file,'utf8');
const dictionaries=Object.fromEntries(['zh-CN','en','ja'].map(lang=>[lang,read(`src/data/${lang}.yml`)]));
const compile=(file,dependencies)=>{
  const exports={};
  const code=ts.transpileModule(read(file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>{assert.ok(name in dependencies,`Unexpected dependency ${name}`);return dependencies[name];}});
  return exports;
};
function content(root=process.cwd()) {
  return compile('src/lib/content.ts',{
    'node:fs':fs,'node:path':{...path,resolve:p=>path.resolve(root,p)},'node:crypto':{createHash},yaml:{parse},marked:{marked},
    ...Object.fromEntries(Object.entries(dictionaries).map(([lang,value])=>[`../data/${lang}.yml?raw`,value])),
    ...Object.fromEntries(['legacy-post-html','legacy-post-hashes','legacy-post-body-hashes'].map(name=>[`../data/${name}.json`,JSON.parse(read(`src/data/${name}.json`))])),
    '../data/post-covers':{defaultPostCover:'/img/blog.jpg',postCovers:{}}
  });
}
const publicContent=content();

test('Japanese fixed documents reuse the original grids, logos, contact icons and privacy hierarchy',()=>{
  const about=load(read('dist/ja/about/index.html'));
  assert.equal(about('.prose > .layout-1').length,4);
  assert.deepEqual(about('.logoList img').map((_,el)=>about(el).attr('src')).get(),['/images/moeqy-logo.svg','/images/conceptsgame-black.png','/images/blogLOGO-2.png']);
  assert.equal(about('.logoList a').first().attr('href'),'/ja/');
  assert.equal(about('.prose .grid').children().length,2);
  assert.equal(about('.title-star use').attr('href'),load(read('dist/about/index.html'))('.title-star use').attr('href'));
  const help=load(read('dist/ja/help/translate/index.html'));
  assert.equal(help('.prose > .layout-1').length,4);
  assert.equal(help('.icon-block').length,4);
  assert.equal(help('.icon-title svg use').length,4);
  assert.equal(help('.block').length,4);
  assert.equal(help('.block-tag:not(.block-tag-no-color)').length,3);
  assert.match(help('.block:has(.block-tag-no-color)').text(),/繁體中文/);
  for(const page of [about,help]){
    assert.deepEqual(page('.about-contact svg use').map((_,el)=>page(el).attr('href')).get(),['github','youxiang','bilibili-fill','wangyiyunyinle'].map(id=>`/img/icon/library.svg#icon-${id}`));
    assert.equal(page('.about-contact a').length,4);
    assert.equal(page('.prose .iconfont').length,0);
  }
  const privacy=load(read('dist/ja/privacy/index.html'));
  assert.equal(privacy('.prose > .layout-1').length,1);
  assert.equal(privacy('.prose h3').length,3);
  assert.equal(privacy('.prose h4').length,6);
  assert.equal(privacy('.prose em').length,2);
  assert.equal(privacy('.prose .grid,.prose .block').length,0);
  assert.match(privacy('.prose').text(),/2025年7月8日/);
});

test('Original-font markers isolate Latin ornaments without overriding Japanese copy or display fonts',()=>{
  for(const route of ['','about/','help/translate/','privacy/','works/','works/myblog/','conceptsgame/']){
    const page=load(read(`dist/ja/${route}index.html`));
    for(const el of page('[data-original-font="body"]').toArray())assert.doesNotMatch(page(el).text(),/[\u3040-\u30ff\u3400-\u9fff]/,`${route}: ${page(el).text()}`);
    assert.equal(page('.header-note').attr('data-original-font'),'body');
    assert.equal(page('.side-nav b[data-original-font]').length,0);
    assert.equal(page('.pickup-word[data-original-font],.hero-subtitle[data-original-font],.dream-ticker[data-original-font]').length,0);
  }
  const css=read('src/styles/header.css');
  assert.match(css,/\.is-ja \[data-original-font="body"\] \{ font-family: Harmony, 'Microsoft YaHei', sans-serif; \}/);
  assert.match(css,/\.is-ja \{ font-family: 'Yu Gothic'/);
  const help=load(read('dist/ja/help/translate/index.html'));
  assert.equal(help('.page-heading .eyebrow').attr('data-original-font'),'body');
});
const paths=module=>compile('src/lib/routes.ts',{'../data/legacy-routes.json':[], './content':module,'./works':{works:[],selectWorks:()=>[]}});

test('Japanese is live in the site and studio, with matching complete dictionary keys and work translations',()=>{
  const snapshot=createStore(process.cwd()).snapshot();
  assert.deepEqual(snapshot.locales.filter(l=>l.status==='live').map(l=>l.code),Array.from(publicContent.liveLanguages));
  assert.equal(snapshot.locales.find(l=>l.code==='ja').dictionary,'src/data/ja.yml');
  const keys=(value,trail='')=>Object.entries(value).flatMap(([key,child])=>typeof child==='object'?keys(child,`${trail}${key}.`):[`${trail}${key}`]).sort();
  for(const lang of ['en','ja'])assert.deepEqual(keys(parse(dictionaries[lang])),keys(parse(dictionaries['zh-CN'])));
  for(const value of Object.values(parse(dictionaries.ja).ui))assert.ok(typeof value==='string' && value.trim());
  for(const work of snapshot.works.filter(w=>w.enabled)) {
    for(const field of ['title','category','description','cta'])assert.ok(work.text.ja[field]);
    assert.match(work.bodies.ja,/^## /);
  }
});

test('Historical articles remain untranslated; Japanese language links fall back to the empty Japanese archive',()=>{
  assert.equal(publicContent.posts.length,16);
  assert.equal(publicContent.postsFor('ja').length,0);
  for(const post of publicContent.posts) {
    assert.equal(publicContent.alternateSlug(post.slug,'ja'),'archives');
    assert.equal(publicContent.alternateSlug(post.slug,post.lang),post.slug);
    assert.equal(fs.existsSync(`dist/ja/${post.slug}/index.html`),false);
    const page=load(read(`dist/${post.slug}/index.html`));
    assert.equal(page('.header-language a[lang=ja]').attr('href'),'/ja/archives/');
    assert.equal(page('link[rel=alternate][hreflang=ja]').length,0,'Archive fallback is not an article hreflang');
  }
  for(const route of ['archives','pages','categories/news','categories/products','categories/work']){
    const page=load(read(`dist/ja/${route}/index.html`));
    assert.equal(page('.archive-news-card').length,0);
    assert.match(page('main').text(),/この言語の記事はまだありません/);
  }
});

test('New Japanese articles publish at Japanese routes and bind to public translations; drafts and unlinking keep archive fallback',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'moeqy-ja-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const dir=path.join(root,'src/content/posts/stories');fs.mkdirSync(dir,{recursive:true});
  for(const [id,lang,extra] of [['original','zh-CN','translationKey: shared'],['japanese','ja','translationKey: shared'],['draft','ja','draft: true'],['unlinked','ja','translationKey: null']]){
    fs.writeFileSync(path.join(dir,id+'.md'),`---\ntitle: ${id}\ndate: 2026-09-13\nlang: ${lang}\ncategories: [お知らせ]\n${extra}\n---\n本文。`);
  }
  const module=content(root), generated=paths(module);
  assert.equal(module.alternateSlug('stories/original','ja'),'stories/japanese');
  assert.equal(module.alternateSlug('stories/japanese','zh-CN'),'stories/original');
  assert.equal(module.alternateSlug('stories/unlinked','en'),'archives');
  assert.equal(module.alternateSlug('stories/japanese','en'),'archives');
  assert.equal(module.postsFor('ja').length,2);
  assert.ok(generated.routes.some(r=>r.path==='ja/stories/japanese' && r.lang==='ja'));
  assert.equal(generated.routes.some(r=>r.path==='stories/japanese' || r.path==='en/stories/japanese' || r.path.endsWith('/draft')),false);
  const category=generated.routes.find(r=>r.path==='ja/categories/news');
  assert.equal(generated.archiveData(category).count,2);
});

test('Japanese fixed pages, canonical, three-way language navigation and sitemap are complete without JavaScript',()=>{
  const sitemap=read('dist/sitemap.xml');
  for(const route of ['', 'about/','privacy/','help/translate/','faq/','feedback/','conceptsgame/','archives/','works/','works/conceptsgame/','works/myblog/']) {
    const page=load(read(`dist/ja/${route}index.html`));
    assert.equal(page('html').attr('lang'),'ja');assert.equal(page('h1').length,1);
    assert.equal(page('link[rel=canonical]').attr('href'),`https://www.moeqy.com/ja/${route}`);
    assert.deepEqual(page('.header-language a').map((_,el)=>page(el).attr('lang')).get(),['zh-CN','en','ja']);
    assert.equal(page('.header-language a[aria-current]').text(),'日本語');
    assert.ok(sitemap.includes(`/ja/${route}`));
    assert.match(page('main').text(),/[ぁ-んァ-ン]/);
  }
  const faq=load(read('dist/ja/faq/index.html'));
  assert.equal(faq('.faq-answer').length,14);assert.equal(faq('.faq-answer[lang=ja]').length,14);
  for(const route of ['about','privacy','help/translate'])assert.ok(load(read(`dist/ja/${route}/index.html`))('.prose').text().length>300);
  const missing=load(read('dist/ja/404.html'));assert.equal(missing('html').attr('lang'),'ja');
  assert.equal(missing('link[rel=canonical]').attr('href'),'https://www.moeqy.com/ja/404.html');
});

test('Studio saves and binds a live Japanese translation without changing the original body',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'moeqy-ja-studio-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const write=(file,value)=>{const p=path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,value);};
  write('src/data/locales.json',read('src/data/locales.json'));write('src/data/works.json','[]');
  for(const [lang,value] of Object.entries(dictionaries))write(`src/data/${lang}.yml`,value);
  write('src/content/posts/stories/original.md','---\ntitle: 原文\ndate: 2026-09-13\nlang: zh-CN\n---\n原有正文。');
  const store=createStore(root);
  const request={isNew:true,slug:'stories/japanese',meta:{title:'日本語の記事',date:'2026-09-13',lang:'ja',categories:['お知らせ'],draft:false},body:'日本語の本文。',translationSource:'stories/original',revision:store.snapshot().revision};
  store.savePost(request);
  const saved=store.snapshot().posts,original=saved.find(p=>p.slug==='stories/original'),translation=saved.find(p=>p.meta.lang==='ja');
  assert.equal(original.body,'原有正文。');assert.equal(translation.body,'日本語の本文。');
  assert.equal(translation.meta.translationKey,original.meta.translationKey);assert.equal(translation.meta.draft,false);
  assert.equal(content(root).alternateSlug('stories/original','ja'),'stories/japanese');
  assert.throws(()=>store.savePost({...request,slug:'ja/about',revision:store.snapshot().revision}),/不能占用系统路由/);
});
