import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { marked } from 'marked';
import { Window } from 'happy-dom';
import * as helpers from '../tools/content-studio/article-relations.mjs';
import { createStore, splitPost } from './studio-store.mjs';

const p=(slug,lang='zh-CN',key=undefined,date='2026-09-12')=>({slug,meta:{title:slug,date,lang,...(key===undefined?{}:{translationKey:key})},body:'## Introduction\n\nArticle content.'});
function fixture(t,posts=[p('stories/source'),p('stories/english','en')]){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'moeqy-relations-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const write=(file,text)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);};
  write('src/data/locales.json',JSON.stringify([{code:'zh-CN',label:'简体中文',status:'live',dictionary:'src/data/zh-CN.yml'},{code:'en',label:'English',status:'live',dictionary:'src/data/en.yml'},{code:'ja',label:'日本語',status:'draft',dictionary:'src/data/locales/ja.yml'}]));
  for(const file of ['src/data/zh-CN.yml','src/data/en.yml','src/data/locales/ja.yml'])write(file,'menu: { home: Home }');
  write('src/data/works.json','[]');
  for(const post of posts)write(`src/content/posts/${post.slug}.md`,`---\r\n# Metadata comment\r\ntitle: ${post.meta.title}\r\ndate: ${post.meta.date}\r\nlang: ${post.meta.lang}\r\ncustom: untouched\r\n${post.meta.translationKey!==undefined?`translationKey: ${post.meta.translationKey}\r\n`:''}---\r\n${post.body.replaceAll('\n','\r\n')}`);
  return {root,write,store:createStore(root)};
}
function publicContent(root){
  const code=ts.transpileModule(fs.readFileSync('src/lib/content.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const readJson=name=>fs.existsSync(path.join(root,'src/data',name))?JSON.parse(fs.readFileSync(path.join(root,'src/data',name),'utf8')):{};
  const dependencies={'node:fs':fs,'node:path':{...path,resolve:relative=>path.resolve(root,relative)},'node:crypto':{createHash},yaml:{parse},marked:{marked},'../data/zh-CN.yml?raw':'{}','../data/en.yml?raw':'{}','../data/ja.yml?raw':'{}','../data/post-covers':{defaultPostCover:'/cover.png',postCovers:{}}};
  for(const name of ['legacy-post-hashes.json','legacy-post-body-hashes.json','legacy-post-html.json'])dependencies[`../data/${name}`]=readJson(name);
  const exports={};vm.runInNewContext(code,{exports,require:name=>dependencies[name]});return exports;
}
function ui(t,store){
  const w=new Window({url:'http://127.0.0.1:4322/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});t.after(()=>w.happyDOM.abort());
  w.structuredClone=structuredClone;w.__helpers=helpers;
  w.document.write(fs.readFileSync('tools/content-studio/index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,''));
  w.fetch=async(url,options)=>{
    const input=options?.body?JSON.parse(options.body):{};
    const routes={'/api/state':()=>({...store.snapshot(),token:'test'}),'/api/post':()=>store.savePost(input),'/api/article-relations':()=>store.saveRelations(input)};
    try{return {ok:true,json:async()=>routes[url]()};}catch(error){return {ok:false,json:async()=>({error:error.message})};}
  };
  const canvas=fs.readFileSync('tools/content-studio/relation-canvas.js','utf8').replace(/^import .*;$/gm,'').replace('export function mountRelationCanvas','window.__mountRelationCanvas=function mountRelationCanvas');
  w.eval(`(()=>{const {applyRelationOperations,relationGroups,postLanguage,postDate,postStatus}=window.__helpers;${canvas}})()`);
  const studio=fs.readFileSync('tools/content-studio/studio.js','utf8').replace(/^import .*;$/gm,'').replace('export {};','');
  w.eval(`(()=>{const {postLanguage,postDate,postStatus,comparePosts,relationGroups}=window.__helpers;const mountRelationCanvas=window.__mountRelationCanvas;${studio}})()`);
  return {w,d:w.document,flush:()=>new Promise(resolve=>setTimeout(resolve,15))};
}

test('Article language and date helpers handle legacy languages, date formats, exact times, ties and invalid dates',()=>{
  const posts=[p('stories/z','en',undefined,'2026/09/12 08:01:00'),p('stories/a','en',undefined,'2026-09-12 08:01:00'),p('stories/early','en',undefined,'2026-09-12'),p('stories/bad','en',undefined,'2026-02-30'),p('stories/latest','en',undefined,'2026-09-12 20:00:00')];
  assert.deepEqual(posts.sort(helpers.comparePosts).map(p=>p.slug),['stories/latest','stories/a','stories/z','stories/early','stories/bad']);
  assert.equal(helpers.postLanguage({meta:{language:'en'}}),'en');assert.equal(helpers.postLanguage({meta:{}}),'zh-CN');
  assert.equal(helpers.postDate(posts.at(-1)),'未设置有效发布时间');
});
test('Relation preview merges whole disjoint groups, rejects duplicate-language conflicts and explicitly unbinds',()=>{
  const posts=[p('a','zh-CN','one'),p('b','en','one'),p('c','ja','two'),p('d','fr','two'),p('e','zh-CN')];
  const merged=helpers.applyRelationOperations(posts,[{type:'bind',source:'b',target:'c'}]);
  assert.equal(helpers.relationGroups(merged)[0].posts.length,4);
  assert.equal(posts[2].meta.translationKey,'two');
  assert.throws(()=>helpers.applyRelationOperations(merged,[{type:'bind',source:'a',target:'e'}]),/语言冲突.*a.*e/);
  const detached=helpers.applyRelationOperations(merged,[{type:'unbind',slug:'b'}]);
  assert.equal(detached.find(p=>p.slug==='b').meta.translationKey,null);assert.equal(helpers.relationGroups(detached).length,3);
  assert.throws(()=>helpers.applyRelationOperations(posts,[{type:'bind',source:'a',target:'missing'}]),/不存在/);
});
test('Relation transactions preserve exact bodies and metadata, back up all members, reject stale saves and rollback a failed multi-file write',t=>{
  const {store,root}=fixture(t);const before=store.snapshot(),originals=Object.fromEntries(before.posts.map(post=>[post.slug,fs.readFileSync(path.join(root,`src/content/posts/${post.slug}.md`),'utf8')]));
  const operation={type:'bind',source:'stories/source',target:'stories/english'};
  const rename=fs.renameSync;let count=0;
  fs.renameSync=(...args)=>{if(++count===2)throw new Error('simulated disk failure');return rename(...args);};
  try{assert.throws(()=>store.saveRelations({operations:[operation],revision:before.revision}),/simulated/);}finally{fs.renameSync=rename;}
  assert.equal(store.snapshot().revision,before.revision);
  for(const [slug,raw] of Object.entries(originals))assert.equal(fs.readFileSync(path.join(root,`src/content/posts/${slug}.md`),'utf8'),raw);
  const result=store.saveRelations({operations:[operation],revision:before.revision});
  for(const post of store.snapshot().posts){assert.equal(post.body,splitPost(originals[post.slug]).body);assert.equal(post.meta.custom,'untouched');assert.match(fs.readFileSync(path.join(root,`src/content/posts/${post.slug}.md`),'utf8'),/# Metadata comment/);assert.equal(fs.readFileSync(path.join(root,result.backup,`src/content/posts/${post.slug}.md`),'utf8'),originals[post.slug]);}
  assert.throws(()=>store.saveRelations({operations:[{type:'unbind',slug:'stories/source'}],revision:before.revision}),error=>error.status===409);
  const row=store.snapshot().posts[0];assert.throws(()=>store.savePost({...row,isNew:false,meta:{...row.meta,translationKey:null},revision:store.snapshot().revision}),/关系页面/);
});
test('Creating a translated draft binds both files only on save and does not leave partial source changes on validation failure',t=>{
  const {store}=fixture(t,[p('stories/source')]);const before=store.snapshot();
  const input={slug:'stories/translated',isNew:true,translationSource:'stories/source',meta:{title:'Translation',lang:'en',draft:true,date:'2026-09-12'},body:'',revision:before.revision};
  assert.throws(()=>store.savePost(input),/正文/);assert.equal(store.snapshot().revision,before.revision);
  store.savePost({...input,body:'## Translated text'});
  const after=store.snapshot();assert.equal(after.posts.length,2);assert.equal(after.posts[0].meta.translationKey,after.posts[1].meta.translationKey);
});
test('Legacy migration binds exactly four pairs, is idempotent, preserves historical rendering and respects explicit unlinking',t=>{
  const pairs=[['chanpin/20240210/post-1','products/20240210/post-1'],...['20230808','20231110','20250708'].map(date=>[`gonggao/${date}/post-1`,`news/${date}/post-1`])];
  const {store,root,write}=fixture(t,pairs.flatMap(([a,b])=>[p(a),p(b,'en')]));
  const hashes={},html={};for(const post of store.snapshot().posts){hashes[post.slug]=createHash('sha256').update(fs.readFileSync(path.join(root,`src/content/posts/${post.slug}.md`))).digest('hex');html[post.slug]='<div class="legacy-special"><p>Original rendering.</p></div>';}
  write('src/data/legacy-post-hashes.json',JSON.stringify(hashes));write('src/data/legacy-post-html.json',JSON.stringify(html));
  assert.equal(store.migrateLegacyRelations().migratedPairs,4);const revision=store.snapshot().revision;
  assert.equal(store.migrateLegacyRelations().migratedPairs,0);assert.equal(store.snapshot().revision,revision);
  let content=publicContent(root);for(const post of content.posts)assert.equal(post.html,html[post.slug]);
  assert.equal(content.alternateSlug(pairs[0][0],'en'),pairs[0][1]);
  store.saveRelations({operations:[{type:'unbind',slug:pairs[0][1]}],revision});
  content=publicContent(root);assert.equal(content.alternateSlug(pairs[0][0],'en'),'archives');assert.equal(content.alternateSlug(pairs[0][1],'zh-CN'),'archives');
  assert.throws(()=>store.migrateLegacyRelations(),/已有关系设置/);
  const post=store.snapshot().posts.find(p=>p.slug===pairs[1][1]);
  store.savePost({...post,isNew:false,meta:{...post.meta,draft:true},revision:store.snapshot().revision});
  content=publicContent(root);assert.equal(content.alternateSlug(pairs[1][0],'en'),'archives');
});
test('Language menu filters counts and search, preserves unsaved edits and defaults new articles to the selected locale',async t=>{
  const {store}=fixture(t,[p('stories/older','zh-CN',undefined,'2025-01-01'),p('stories/newer','zh-CN',undefined,'2026/09/12 12:00:00'),p('stories/en','en')]);
  const {w,d,flush}=ui(t,store);await flush();
  assert.equal(d.querySelectorAll('.language-door').length,3);assert.match(d.querySelector('[data-article-language="zh-CN"]').textContent,/2 篇/);assert.equal(d.querySelector('.workspace').hidden,true);
  d.querySelector('[data-article-language="zh-CN"]').click();assert.deepEqual([...d.querySelectorAll('.item')].map(e=>e.dataset.id),['stories/newer','stories/older']);
  d.querySelector('#search').value='older';d.querySelector('#search').dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.item').length,1);
  d.querySelector('.item').click();await flush();const title=d.querySelector('[name=title]');title.value='Unsaved';title.dispatchEvent(new w.Event('input',{bubbles:true}));
  d.querySelector('#back-to-languages').click();await flush();assert.equal(d.querySelector('#confirm-dialog').open,true);d.querySelector('#confirm-dialog').close('cancel');await flush();assert.equal(d.querySelector('[name=title]').value,'Unsaved');
  d.querySelector('#back-to-languages').click();await flush();d.querySelector('#confirm-dialog').close('discard');await flush();d.querySelector('[data-article-language="en"]').click();d.querySelector('#create').click();await flush();assert.equal(d.querySelector('[name=lang]').value,'en');
});

test('Translation UI requires a target locale, cancellation writes nothing, and saving returns to that language list',async t=>{
  const {store}=fixture(t,[p('stories/source')]);const {w,d,flush}=ui(t,store);await flush();
  d.querySelector('[data-article-language="zh-CN"]').click();d.querySelector('.item').click();await flush();
  const revision=store.snapshot().revision;
  d.querySelector('#new-translation').click();await flush();assert.equal(d.querySelector('#translation-dialog').open,true);
  assert.deepEqual([...d.querySelectorAll('#translation-form option')].map(o=>o.value),['en','ja']);
  d.querySelector('#translation-cancel').click();assert.equal(store.snapshot().revision,revision);
  d.querySelector('#new-translation').click();await flush();d.querySelector('[name=targetLanguage]').value='ja';
  assert.equal(d.querySelector('#translation-form').elements.targetLanguage.value,'ja');
  d.querySelector('#translation-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(d.querySelector('[name=lang]').value,'ja',d.querySelector('[name=lang]').outerHTML + d.querySelector('#article-language-name').textContent);assert.equal(store.snapshot().posts.length,1);
  d.querySelector('#back-to-languages').click();await flush();d.querySelector('#confirm-dialog').close('discard');await flush();
  assert.equal(store.snapshot().revision,revision);
  d.querySelector('[data-article-language="zh-CN"]').click();d.querySelector('.item').click();await flush();d.querySelector('#new-translation').click();await flush();
  d.querySelector('[name=targetLanguage]').value='en';d.querySelector('#translation-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  for(const [name,value] of [['title','English version'],['body','## English introduction']]){const field=d.querySelector(`[name=${name}]`);field.value=value;field.dispatchEvent(new w.Event('input',{bubbles:true}));}
  d.querySelector('#content-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await flush();
  assert.equal(store.snapshot().posts.length,2);assert.match(d.querySelector('#article-language-name').textContent,/English/);
  assert.equal(store.snapshot().articleGroups[0].slugs.length,2);
});
test('Canvas supports candidate binding preview, conflict messaging, undo/discard, pointer connections and explicit save',async t=>{
  const {store}=fixture(t,[p('stories/source'),p('stories/english','en'),p('stories/conflict')]);const {w,d,flush}=ui(t,store);await flush();
  d.querySelector('[data-section=relations]').click();await flush();d.querySelector('[data-id="post:stories/source"]').click();await flush();
  assert.equal(d.querySelectorAll('.graph-node').length,4);assert.equal(d.querySelectorAll('.missing-node').length,2);
  const initial=store.snapshot().revision;
  d.querySelector('[data-bind="stories/english"]').click();assert.equal(d.querySelector('[data-pending-count]').textContent,'1');assert.equal(store.snapshot().revision,initial);
  d.querySelector('[data-bind="stories/conflict"]').click();assert.match(d.querySelector('.relation-error').textContent,/语言冲突/);assert.equal(d.querySelector('[data-pending-count]').textContent,'1');
  d.querySelector('[data-undo]').click();assert.equal(d.querySelector('[data-pending-count]').textContent,'0');
  const viewport=d.querySelector('.graph-viewport');viewport.setPointerCapture=()=>{};viewport.hasPointerCapture=()=>false;
  d.elementFromPoint=()=>d.querySelector('[data-drop-slug="stories/english"]');
  d.querySelector('.graph-group [data-port]').dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,clientX:100,clientY:100}));
  viewport.dispatchEvent(new w.PointerEvent('pointermove',{bubbles:true,pointerId:1,clientX:500,clientY:200}));
  viewport.dispatchEvent(new w.PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:500,clientY:200}));
  assert.equal(d.querySelector('[data-pending-count]').textContent,'1');
  d.querySelector('[data-discard]').click();assert.equal(d.querySelector('[data-pending-count]').textContent,'0');assert.equal(store.snapshot().revision,initial);
  d.querySelector('[data-bind="stories/english"]').click();d.querySelector('[data-save-relations]').click();await flush();
  assert.equal(store.snapshot().articleGroups.find(g=>g.slugs.includes('stories/source')).slugs.length,2);assert.equal(d.querySelector('[data-pending-count]').textContent,'0');
  d.querySelector('[data-unbind="stories/english"]').click();d.querySelector('[data-save-relations]').click();await flush();assert.equal(store.snapshot().posts.find(p=>p.slug==='stories/english').meta.translationKey,null);
});

test('Canvas adapts its node arrangement to narrow widths, supports zoom and pan, and recenters after resize',async t=>{
  const {store}=fixture(t);const {w,d,flush}=ui(t,store);await flush();
  let width=320,resize;
  Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{configurable:true,get(){return this.classList.contains('graph-viewport')?width:0;}});
  Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{configurable:true,get(){return this.classList.contains('graph-viewport')?640:0;}});
  w.ResizeObserver=class {constructor(callback){resize=callback;}observe(){}disconnect(){}};
  d.querySelector('[data-section=relations]').click();await flush();d.querySelector('[data-id="post:stories/source"]').click();await flush();
  const world=d.querySelector('.graph-world'),viewport=d.querySelector('.graph-viewport');
  assert.equal(world.style.width,'380px');assert.equal(d.querySelector('.missing-node').style.left,'25px');
  const initialZoom=d.querySelector('[data-zoom-value]').textContent;d.querySelector('[data-zoom=in]').click();assert.notEqual(d.querySelector('[data-zoom-value]').textContent,initialZoom);
  viewport.setPointerCapture=()=>{};viewport.hasPointerCapture=()=>false;const initialTransform=world.style.transform;
  viewport.dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:2,clientX:20,clientY:20}));
  viewport.dispatchEvent(new w.PointerEvent('pointermove',{bubbles:true,pointerId:2,clientX:70,clientY:90}));
  viewport.dispatchEvent(new w.PointerEvent('pointerup',{bubbles:true,pointerId:2,clientX:70,clientY:90}));
  assert.notEqual(world.style.transform,initialTransform);d.querySelector('[data-center]').click();
  const coordinates=value=>value.match(/-?\d+(?:\.\d+)?/g).map(Number);
  coordinates(world.style.transform).forEach((value,index)=>assert.ok(Math.abs(value-coordinates(initialTransform)[index])<1e-8));
  width=800;resize();assert.equal(world.style.width,'760px');assert.equal(d.querySelector('.missing-node').style.left,'380px');
});
