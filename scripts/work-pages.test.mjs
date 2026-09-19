import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { marked } from 'marked';
import { load } from 'cheerio';

const data=JSON.parse(fs.readFileSync('src/data/works.json','utf8'));
const link=(lang,route='')=>`${lang==='zh-CN'?'':`/${lang}`}/${route.replace(/^\/|\/$/g,'')}${route?'/':''}`;
const compile=(file,dependencies)=>{
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>{assert.ok(name in dependencies,`Unexpected dependency ${name}`);return dependencies[name];}});
  return exports;
};
const workModule=compile('src/lib/works.ts',{'../data/works.json':data,'./content':{link}});
const bodies=compile('src/lib/work-content.ts',{'node:fs':fs,'node:path':path,'marked':{marked},'./works':workModule});

test('Homepage and directory recommendations filter independently, preserving order and excluding disabled works',()=>{
  const items=[
    {...data[0],id:'all-only',homeFeatured:undefined,pageFeatured:undefined},
    {...data[0],id:'home-only',homeFeatured:true,pageFeatured:false},
    {...data[0],id:'page-only',homeFeatured:false,pageFeatured:true},
    {...data[0],id:'disabled',enabled:false,homeFeatured:true,pageFeatured:true},
  ];
  const ids=placement=>Array.from(workModule.selectWorks(items,placement),work=>work.id);
  assert.deepEqual(ids('all'),['all-only','home-only','page-only']);
  assert.deepEqual(ids('home'),['home-only']);assert.deepEqual(ids('page'),['page-only']);
  assert.equal(workModule.selectWorks([]).length,0);
  assert.equal(workModule.selectWorks([items[1]],'home').length,1);
});

test('Enabled works require nonempty Markdown in all three live languages, while disabled works do not load bodies',()=>{
  assert.equal(Object.keys(bodies.loadWorkContent(data)).length,2);
  assert.deepEqual(Object.keys(bodies.loadWorkContent([{...data[0],id:'not-published',enabled:false} ])),[]);
  assert.throws(()=>bodies.loadWorkContent([{...data[0],id:'missing-body'}]),/Missing work introduction/);
  assert.throws(()=>bodies.loadWorkContent([data[0],data[0]]),/duplicate work ID/);
  assert.throws(()=>bodies.loadWorkContent([{...data[0],id:'..\/escape'}]),/Invalid/);
  const fakeFs={existsSync:file=>!file.endsWith('en.md'),readFileSync:()=> '## Introduction\n\nText.'};
  assert.throws(()=>compile('src/lib/work-content.ts',{'node:fs':fakeFs,'node:path':path,'marked':{marked},'./works':workModule}),/Missing work introduction.*en.md/);
  assert.throws(()=>compile('src/lib/work-content.ts',{'node:fs':{...fakeFs,existsSync:file=>!file.endsWith('ja.md')},'node:path':path,'marked':{marked},'./works':workModule}),/Missing work introduction.*ja.md/);
  for(const body of ['', '# Extra page title']) {
    assert.throws(()=>compile('src/lib/work-content.ts',{'node:fs':{existsSync:()=>true,readFileSync:()=>body},'node:path':path,'marked':{marked},'./works':workModule}),/Empty|heading level 2/);
  }
});

test('Static routes include all enabled works regardless of recommendation flags and exclude disabled details',()=>{
  const fixtures=[{...data[0],id:'listed',homeFeatured:false,pageFeatured:false},{...data[1],id:'hidden',enabled:false}];
  const module=compile('src/lib/routes.ts',{'../data/legacy-routes.json':[],'./content':{posts:[],postsFor:()=>[]},'./works':{...workModule,works:fixtures}});
  assert.deepEqual(Array.from(module.routes.filter(route=>route.kind==='work-detail'),route=>route.path),['en/works/listed','ja/works/listed','works/listed']);
  assert.equal(module.routes.filter(route=>route.kind==='works').length,3);
  assert.equal(module.routes.some(route=>route.path.includes('/hidden')),false);
});

test('All three languages expose complete directory and detail links without JavaScript or duplicate nested links',()=>{
  const sitemap=fs.readFileSync('dist/sitemap.xml','utf8');
  for(const lang of ['zh-CN','en','ja']) {
    const prefix=lang==='zh-CN'?'':`${lang}/`;
    const page=load(fs.readFileSync(`dist/${prefix}works/index.html`,'utf8'));
    assert.equal(page('h1').length,1);assert.equal(page('h1').text().replace(/\.$/,''),'WORKS');
    assert.equal(page('[data-work-panel]').length,2);assert.equal(page('[data-work-card]').length,2);
    assert.equal(page('[data-work-panel][hidden], [data-work-panel][inert]').length,0);
    assert.equal(page('a a').length,0);
    assert.equal(page('.menu-dialog [aria-current="page"]').attr('href'),`/${prefix}works/`);
    assert.equal(page(`.header-language a[lang="${prefix?'zh-CN':'en'}"]`).attr('href'),`/${prefix?'':'en/'}works/`);
    for(const work of data) {
      const detailHref=workModule.workDetailLink(work,lang);
      const href=workModule.workLink(work,lang);
      assert.ok(sitemap.includes(detailHref));
      const card=page(`[data-work-card="${work.id}"]`);
      assert.equal(card.find('.work-card-cover').attr('href'),detailHref);
      assert.equal(card.find('h3 a').attr('href'),detailHref);
      assert.equal(card.find('.work-card-visit').attr('href'),href);
      const detail=load(fs.readFileSync(`dist/${prefix}works/${work.id}/index.html`,'utf8'));
      assert.equal(detail('h1').text(),workModule.workText(work,lang).title);
      assert.equal(detail('.work-detail-actions .pill-button').attr('href'),href);
      assert.equal(detail('.work-detail-actions .work-detail-link').attr('href'),`/${prefix}works/`);
      assert.equal(detail('.article-meta time').length,0);
      assert.equal(detail('link[rel=canonical]').attr('href'),`https://www.moeqy.com${detailHref}`);
      assert.equal(detail('[data-work-panel]').length,0);
      const expected=load(bodies.workContent[work.id][lang]).text().replace(/\s+/g,'');
      assert.equal(detail('.product-story').text().replace(/\s+/g,''),expected);
    }
  }
});
