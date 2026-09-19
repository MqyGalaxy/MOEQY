import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { parse } from 'yaml';
import { marked } from 'marked';
import { createHash } from 'node:crypto';
import { createStore, splitPost } from './studio-store.mjs';
import { createStudioServer } from './content-studio.mjs';
import { Window } from 'happy-dom';
import http from 'node:http';
import * as relationHelpers from '../tools/content-studio/article-relations.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'moeqy-studio-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const write=(file,text)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);};
  write('src/data/locales.json',JSON.stringify([{code:'zh-CN',label:'简体中文',status:'live',dictionary:'src/data/zh-CN.yml'},{code:'en',label:'English',status:'live',dictionary:'src/data/en.yml'}]));
  write('src/data/zh-CN.yml','# Preserve comments\nmenu:\n  home: 首页\n  works: 作品\n');write('src/data/en.yml','menu:\n  home: Home\n');
  write('src/data/works.json','[]');
  write('src/content/posts/stories/original.md','---\n# Preserve metadata\ntitle: Original\ndate: 2026-09-12\nlang: zh-CN\ncategories: [公告]\ntag: [1]\ncustom: kept\n---\n\nOriginal content.');
  write('public/cover.png',Buffer.from([137,80,78,71,13,10,26,10]));
  for(const file of ['index.html','studio.js','studio.css','article-relations.mjs','relation-canvas.js'])write(`tools/content-studio/${file}`,fs.readFileSync(`tools/content-studio/${file}`));
  return {root,store:createStore(root),write};
}
function post(store,slug='stories/new-post',meta={}){return {slug,isNew:true,meta:{title:'New story',date:'2026-09-12',lang:'zh-CN',categories:['公告'],tag:[],...meta},body:'## Hello\n\nA new story.',revision:store.snapshot().revision};}
function work(store){return {isNew:true,work:{id:'new-work',enabled:true,homeFeatured:true,pageFeatured:false,href:'https://example.com',cover:'/cover.png',text:Object.fromEntries(['zh-CN','en'].map(lang=>[lang,{title:'Work',category:'Game',description:'Description',cta:'Visit'}]))},bodies:{'zh-CN':'## 介绍\n\n作品介绍。',en:'## About\n\nIntroduction.'},revision:store.snapshot().revision};}

test('Studio adds and edits posts, preserving unknown YAML and backups, and detects stale writes',t=>{
  const {store,root,write}=fixture(t);const original=store.snapshot().posts[0];const oldRevision=store.snapshot().revision;
  const result=store.savePost({...original,isNew:false,meta:{...original.meta,title:'Edited'},body:'Updated content.',revision:oldRevision});
  const raw=fs.readFileSync(path.join(root,'src/content/posts/stories/original.md'),'utf8');
  assert.match(raw,/# Preserve metadata/);assert.equal(splitPost(raw).meta.custom,'kept');
  assert.match(fs.readFileSync(path.join(root,result.backup,'src/content/posts/stories/original.md'),'utf8'),/Original content/);
  assert.throws(()=>store.savePost({...original,isNew:false,revision:oldRevision}),error=>error.status===409);
  store.savePost(post(store));assert.equal(store.snapshot().posts.length,2);
  assert.throws(()=>store.savePost(post(store)),/已存在/);
  assert.throws(()=>store.savePost({...post(store,'stories/bad'),meta:{title:'Bad',date:'2026-02-30',lang:'zh-CN'}}),/日期/);
  assert.throws(()=>store.savePost(post(store,'../escape')),/路径/);
  assert.throws(()=>store.safe('src/../../escape'),/非法/);
  write('src/content/posts/post-1.md','---\ntitle: Legacy root\ndate: 2026-09-12\nlanguage: zh-CN\n---\nOld root article.');
  const rootPost=store.snapshot().posts.find(p=>p.slug==='post-1');
  store.savePost({...rootPost,isNew:false,body:'Updated root article.',revision:store.snapshot().revision});
  assert.equal(store.snapshot().posts.find(p=>p.slug==='post-1').body,'Updated root article.');
});
test('Studio requires complete live work translations and commits JSON plus both Markdown files together',t=>{
  const {store,root}=fixture(t);const input=work(store);
  assert.throws(()=>store.saveWork({...input,bodies:{'zh-CN':input.bodies['zh-CN']}}),/English正文/);
  assert.throws(()=>store.saveWork({...input,bodies:{...input.bodies,en:'# Wrong heading'}}),/二级标题/);
  assert.equal(store.snapshot().works.length,0);
  store.saveWork(input);assert.equal(store.snapshot().works[0].bodies.en,input.bodies.en);
  const saved=JSON.parse(fs.readFileSync(path.join(root,'src/data/works.json'),'utf8'))[0];
  assert.equal(saved.homeFeatured,true);assert.equal(saved.pageFeatured,false);assert.equal(saved.bodies,undefined);
  const disabled=work(store);disabled.work.id='draft-work';disabled.work.enabled=false;disabled.work.text={};disabled.bodies={};store.saveWork(disabled);
  assert.equal(store.snapshot().works.length,2);
});
test('Studio prepares locale drafts, preserves dictionary comments, and associates one post per language',t=>{
  const {store,root}=fixture(t);
  store.addLocale({code:'ja',label:'日本語',revision:store.snapshot().revision});
  assert.equal(store.snapshot().locales[2].status,'draft');
  assert.throws(()=>store.savePost(post(store,'stories/japanese',{lang:'ja'})),/草稿/);
  store.savePost({...post(store,'stories/japanese',{lang:'ja',draft:true}),translationSource:'stories/original'});
  assert.throws(()=>store.savePost({...post(store,'stories/duplicate',{lang:'ja',draft:true}),translationSource:'stories/original'}),/语言冲突/);
  store.saveDictionary({locale:'zh-CN',entries:[{path:['menu','home'],value:'主页'}],revision:store.snapshot().revision});
  assert.match(fs.readFileSync(path.join(root,'src/data/zh-CN.yml'),'utf8'),/# Preserve comments/);
  assert.throws(()=>store.saveDictionary({locale:'en',entries:[{path:['__proto__','evil'],value:'bad'}],revision:store.snapshot().revision}),/格式/);
  assert.throws(()=>store.addLocale({code:'../../escape',label:'Bad',revision:store.snapshot().revision}),/语言代码/);
});
test('Studio upload checks type, writes a unique local asset and leaves existing files intact',t=>{
  const {store,root}=fixture(t);const data=Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
  const a=store.upload({name:'../../cover.png',data}),b=store.upload({name:'cover.png',data});
  assert.notEqual(a.path,b.path);assert.match(a.path,/^\/images\/uploads\/[\w-]+\.png$/);
  assert.ok(fs.existsSync(path.join(root,'public',a.path)));assert.equal(fs.statSync(path.join(root,'public/cover.png')).size,8);
  assert.throws(()=>store.upload({name:'bad.svg',data:Buffer.from('<svg/>').toString('base64')}),/请选择有效/);
  assert.throws(()=>store.upload({name:'bad.png',data:Buffer.from('bad').toString('base64')}),/请选择有效/);
});
test('Studio HTTP service rejects cross-origin, bad Host and missing-token writes and never exposes source files',async t=>{
  const {root}=fixture(t);const server=createStudioServer(root,0);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const state=await (await fetch(`${origin}/api/state`)).json();assert.ok(state.token);
  const send=(endpoint,headers,data={})=>fetch(`${origin}/api/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  assert.equal((await send('post',{})).status,403);
  assert.equal((await send('post',{'X-Studio-Token':state.token,Origin:'https://evil.example'})).status,403);
  const badHost=await new Promise((resolve,reject)=>http.get(origin,{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject));
  assert.equal(badHost,403);
  assert.equal((await fetch(`${origin}/src/data/works.json`)).status,404);
  assert.equal((await fetch(`${origin}/asset/..%2f..%2fpackage.json`)).status,404);
  const preview=await (await send('preview',{'X-Studio-Token':state.token},{body:'## Preview\n\n![cover](/cover.png)'})).json();
  assert.match(preview.html,/<h2>Preview/);assert.match(preview.html,/\/asset\/cover.png/);
});
test('Public post loader excludes future-language drafts, uses explicit covers and resolves translation groups',t=>{
  const {store,root}=fixture(t);
  store.savePost(post(store,'stories/welcome-cn',{cover:'/cover.png'}));
  store.savePost({...post(store,'stories/welcome-en',{lang:'en'}),translationSource:'stories/welcome-cn'});
  store.addLocale({code:'ja',label:'日本語',revision:store.snapshot().revision});
  store.savePost({...post(store,'stories/welcome-ja',{lang:'ja',draft:true}),translationSource:'stories/welcome-cn'});
  const exports={};const code=ts.transpileModule(fs.readFileSync('src/lib/content.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const dependencies={'node:fs':fs,'node:path':{...path,resolve:relative=>path.resolve(root,relative)},'node:crypto':{createHash},yaml:{parse},marked:{marked},'../data/zh-CN.yml?raw':'{}','../data/en.yml?raw':'{}','../data/ja.yml?raw':'{}','../data/legacy-post-html.json':{},'../data/legacy-post-hashes.json':{},'../data/legacy-post-body-hashes.json':{},'../data/post-covers':{defaultPostCover:'/fallback.png',postCovers:{}}};
  vm.runInNewContext(code,{exports,require:name=>dependencies[name]});
  assert.equal(exports.posts.some(p=>p.lang==='ja'),false);
  assert.equal(exports.posts.find(p=>p.slug==='stories/welcome-cn').cover,'/cover.png');
  assert.equal(exports.alternateSlug('stories/welcome-cn','en'),'stories/welcome-en');
  assert.equal(exports.alternateSlug('chanpin/20240210/post-1','en'),'products/20240210/post-1');
  const routeCode=ts.transpileModule(fs.readFileSync('src/lib/routes.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const routeExports={};const postFixtures=Array.from({length:15},(_,i)=>({slug:`stories/new-${i}`,lang:'zh-CN',listed:true,category:'Custom',categorySlug:'uncategorized',date:'2026-09-12',tags:[]}));
  vm.runInNewContext(routeCode,{exports:routeExports,require:name=>({'../data/legacy-routes.json':[],'./content':{posts:postFixtures,postsFor:lang=>postFixtures.filter(p=>p.lang===lang)},'./works':{works:[],selectWorks:()=>[]}}[name])});
  assert.ok(routeExports.routes.some(r=>r.path==='categories/uncategorized/page/2'));
  assert.ok(routeExports.routes.some(r=>r.path==='archives/page/3'));
});
test('Studio UI edits source-backed content, keeps work language buffers and renders preview only in a sandbox',async t=>{
  const {store}=fixture(t);const window=new Window({url:'http://127.0.0.1:4322/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  t.after(()=>window.happyDOM.abort());window.structuredClone=structuredClone;
  window.document.write(fs.readFileSync('tools/content-studio/index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,''));
  window.fetch=async(url,options)=>{
    const input=options?.body?JSON.parse(options.body):{};
    const routes={'/api/state':()=>({...store.snapshot(),token:'test'}),'/api/work':()=>store.saveWork(input),'/api/post':()=>store.savePost(input),'/api/preview':()=>({html:marked.parse(input.body)})};
    try{return {ok:true,json:async()=>routes[url]()};}catch(error){return {ok:false,json:async()=>({error:error.message})};}
  };
  window.__relationHelpers=relationHelpers;
  window.eval(`(()=>{const {postLanguage,postDate,postStatus,comparePosts,relationGroups}=window.__relationHelpers;const mountRelationCanvas=()=>{};${fs.readFileSync('tools/content-studio/studio.js','utf8').replace(/^import .*;$/gm,'').replace('export {};','')}})()`);
  const flush=()=>new Promise(resolve=>setTimeout(resolve,10));await flush();
  const d=window.document;assert.equal(d.querySelectorAll('.language-door').length,2,d.querySelector('#status').textContent);d.querySelector('[data-section=works]').click();await flush();d.querySelector('#create').click();await flush();
  const change=(name,value)=>{const e=d.querySelector(`[name="${name}"]`);e.value=value;e.dispatchEvent(new window.Event('input',{bubbles:true}));};
  change('id','ui-work');change('href','https://example.com');change('cover','/cover.png');change('title','中文名称');change('body','## 中文正文');
  d.querySelector('[data-work-locale=en]').click();change('title','English title');change('body','## English body');
  d.querySelector('[data-work-locale="zh-CN"]').click();assert.equal(d.querySelector('[name=title]').value,'中文名称');
  d.querySelector('#preview').click();await flush();assert.equal(d.querySelector('iframe').getAttribute('sandbox'),'');assert.match(d.querySelector('iframe').srcdoc,/中文正文/);
  d.querySelector('#content-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await flush();
  assert.equal(store.snapshot().works[0].text.en.title,'English title');assert.equal(store.snapshot().works[0].bodies['zh-CN'],'## 中文正文');
});
