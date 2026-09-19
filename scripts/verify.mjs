import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { parse } from 'yaml';
import { createHash } from 'node:crypto';
import { marked } from 'marked';
const root = path.resolve('dist');
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const clean = s => s.replace(/\s+/g,'').replaceAll('↗','').trim();
const resolveUrl = url => {
  const pathname=decodeURIComponent(new URL(url,'https://www.moeqy.com').pathname);
  const direct=path.join(root,pathname);
  return fs.existsSync(direct) && fs.statSync(direct).isFile() ? direct : path.join(direct,'index.html');
};
const legacy=JSON.parse(fs.readFileSync('src/data/legacy-routes.json','utf8'));
for(const route of legacy) assert.ok(fs.existsSync(resolveUrl('/'+route)),`Missing old route: ${route}`);
const errors=[];
const pages=walk(root).filter(f=>f.endsWith('.html')&&!f.includes(path.join('img','icon')));
let linkCount=0;
const iconFiles = new Map();
for(const file of pages){
  const $=load(fs.readFileSync(file,'utf8'));
  assert.equal($('main').length,1,`Main landmark: ${file}`);
  assert.equal($('h1').length,1,`Page title: ${file}`);
  assert.ok($('html').attr('lang'),`Document language: ${file}`);
  // Every UI icon must have explicit geometry and a real local SVG target.
  // This catches new font placeholders and missing sprite symbols at build time.
  $('.ui-icon').each((_, el) => {
    const icon = $(el);
    assert.equal(el.tagName, 'svg', `Use the shared SVG Icon component: ${file}`);
    assert.match(icon.attr('viewBox') || '', /^0 0 \d+ \d+$/, `Icon viewBox: ${file}`);
    assert.equal(icon.attr('aria-hidden'), 'true', `Decorative icon accessibility: ${file}`);
    const [asset, id] = (icon.find('use').attr('href') || '').split('#');
    assert.ok(asset && id, `Icon source: ${file}`);
    if (!iconFiles.has(asset)) iconFiles.set(asset, load(fs.readFileSync(resolveUrl(asset), 'utf8'), { xmlMode: true }));
    assert.equal(iconFiles.get(asset)(`[id="${id}"]`).length, 1, `Missing icon ${asset}#${id}`);
  });
  const ids=$('[id]').map((_,e)=>$(e).attr('id')).get();
  assert.equal(ids.length,new Set(ids).size,`Duplicate IDs: ${file}`);
  $('[href], [src], [poster]').each((_,el)=>{
    for(const attr of ['href','src','poster']){
      const value=$(el).attr(attr); if(!value||value.startsWith('#')||/^(mailto:|data:|https?:|\/\/)/.test(value))continue;
      const base='/'+path.relative(root,file).replaceAll('\\','/');
      const resolved=new URL(value,'https://www.moeqy.com'+base);
      const target=resolveUrl(resolved.pathname);
      linkCount++;
      if(!fs.existsSync(target))errors.push(`${path.relative(root,file)}: ${attr}=${value}`);
    }
  });
  $('[role=tab]').each((_,el)=>assert.ok($(`[id="${$(el).attr('aria-controls')}"]`).length,`Tab panel missing: ${file}`));
}
assert.deepEqual([...new Set(errors)],[], 'Broken internal links or resources');
const docs=JSON.parse(fs.readFileSync('src/data/documents.json','utf8'));
for(const [key,html] of Object.entries(docs)){
  const [lang,...segments]=key.split('/');
  const out=load(fs.readFileSync(resolveUrl(`/${lang==='en'?'en/':''}${segments.join('/')}/`),'utf8'));
  const expected=load(html);
  if(segments.join('/')==='help/translate') expected('.block').filter((_,el)=>expected(el).find('.about-title').text().startsWith('日本語')).find('.block-tag span').text(lang==='en'?'Implemented':'已上线');
  assert.equal(clean(out('article.prose').text()),clean(expected.text()),`Incomplete document ${key}`);
}
const sourcePosts=walk('src/content/posts').filter(f=>f.endsWith('.md')).filter(file=>parse(fs.readFileSync(file,'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]).draft!==true);
const legacyHtml=JSON.parse(fs.readFileSync('src/data/legacy-post-html.json','utf8'));
const legacyHashes=JSON.parse(fs.readFileSync('src/data/legacy-post-hashes.json','utf8'));
const legacyBodyHashes=JSON.parse(fs.readFileSync('src/data/legacy-post-body-hashes.json','utf8'));
const postMetadata=[];
for(const file of sourcePosts){
  const raw=fs.readFileSync(file,'utf8'); const meta=parse(raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
  postMetadata.push(meta);
  const slug=path.relative('src/content/posts',file).replaceAll('\\','/').replace(/\.md$/,'');
  const body=raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)[1];
  const original=legacyHashes[slug]===createHash('sha256').update(raw).digest('hex') || legacyBodyHashes[slug]===createHash('sha256').update(body.replaceAll('\r\n','\n')).digest('hex');
  const expected=original?legacyHtml[slug]:marked.parse(raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)[1].replace('<!--more-->','<span id="more"></span>'),{breaks:true});
  for(const prefix of ['','en/']){
    const p=load(fs.readFileSync(resolveUrl('/'+prefix+slug+'/'),'utf8'));
    assert.ok(p('h1').text().includes(meta.title),`Article title missing ${slug}`);
    assert.ok(p('article.prose').text().trim().length>0,`Article content missing ${slug}`);
    assert.equal(clean(p('article.prose').text()),clean(load(expected).text()),`Article content differs from ${original?'legacy snapshot':'current Markdown'}: ${slug}`);
  }
}
const faq=load(fs.readFileSync(resolveUrl('/faq/'),'utf8'));
assert.equal(faq('.faq-panel details').length,14);
assert.equal(faq('.faq-tabs [role=tab]').length,5);
for(const lang of ['','en/']){
  const p=load(fs.readFileSync(resolveUrl('/'+lang+'pages/'),'utf8'));
  assert.equal(p('.news-row, .archive-news-card').length,sourcePosts.length,'Complete all-posts page');
}
const zhCount=postMetadata.filter(p=>p.lang==='zh-CN').length,enCount=postMetadata.filter(p=>p.lang==='en').length,tagCount=postMetadata.filter(p=>p.lang==='zh-CN' && (p.tag || p.tags || []).map(String).includes('1')).length;
const expectedCounts={'/archives/':Math.min(6,zhCount),'/archives/page/2/':Math.min(6,zhCount>6?zhCount-6:zhCount),'/tags/1/':Math.min(6,tagCount),'/tags/1/page/2/':Math.min(6,tagCount>6?tagCount-6:tagCount),'/en/archives/':Math.min(6,enCount)};
for(const [route,count] of Object.entries(expectedCounts))assert.equal(load(fs.readFileSync(resolveUrl(route),'utf8'))('.news-row, .archive-news-card').length,count,`Legacy pagination: ${route}`);
for(const prefix of ['', 'en/']){
  const home=load(fs.readFileSync(resolveUrl('/'+prefix),'utf8'));
  const about=load(fs.readFileSync(resolveUrl('/'+prefix+'about/'),'utf8'));
  const archive=load(fs.readFileSync(resolveUrl('/'+prefix+'archives/'),'utf8'));
  assert.deepEqual(home('main>section[id]').map((_,e)=>home(e).attr('id')).get(),['pickup','introduction','news','works','about']);
  assert.equal(home('.hero').length,0);assert.equal(about('.hero').length,1);
  assert.equal(home('.interest-panel').length,4);assert.equal(about('.interest-panel').length,0);
  const introSource=parse(fs.readFileSync(`src/data/${prefix ? 'en' : 'zh-CN'}.yml`,'utf8')).index;
  assert.deepEqual(home('.intro-copy>p').map((_,e)=>home(e).text()).get(),[introSource.about.text1,introSource.about.text2]);
  for(const key of ['acgn','video','game','more']) {
    assert.equal(home(`#interest-${key} .interest-sheet>p`).text(),introSource.detailed[key].text,`Complete interest copy: ${prefix}${key}`);
    assert.equal(home(`#interest-${key}`).attr('hidden'),undefined,'All interests remain readable without JavaScript');
    assert.ok(!home(`#interest-${key} img`).attr('src').includes('MqyGalaxy'),'Use site mascot, not author persona');
  }
  assert.equal(about('.dream-ticker').length,1);assert.ok(about('#about-content').length);
  assert.equal(home('.home-news-card').length,3);
  assert.deepEqual(home('.home-news-card').map((_,e)=>home(e).attr('href')).get(),archive('.news-row, .archive-news-card').slice(0,3).map((_,e)=>archive(e).attr('href')).get());
  assert.equal(home('.feature-button').length,2);
  assert.equal(home('#pickup div[data-video-surface]').length,1);
  assert.equal(home('#pickup button.pickup-play[data-video-open]').length,1);
  assert.equal(home('[data-video-surface][data-video-open]').length,0);
  assert.equal(home('.pickup-paper-cover').attr('aria-hidden'),'true');
  for(const profile of ['desktop','mobile']) {
    const paper=home(`#pickup-paper-${profile}-shape`).attr('d');
    const boundary=home(profile==='desktop'?'#pickup-curve path':'#pickup-curve-mobile path').attr('d');
    assert.equal(paper.replace(/^M0 1 /,'M0 0 ').replace(/ L1 1 Z$/,' L1 0 Z'),boundary);
    assert.equal(home(`.pickup-paper-${profile}>use[fill="#fdeef5"]`).length,1,'The foreground must contain opaque paper, not only a transparent texture');
  }
  assert.equal(home('[data-video-surface] .pickup-word-main').text(),'PICKUP');
  assert.equal(home('.pickup-graphic').attr('aria-hidden'),'true');
  assert.equal(home('#pickup h1').length,1);
  const pickupItems=JSON.parse(home('[data-pickup-data]').text());
  assert.equal(pickupItems.length,3,'Three configured PICK UP visuals');
  assert.equal(new Set(pickupItems.map(item=>item.id)).size,3,'Stable unique PICK UP IDs');
  assert.equal(home('[data-pickup-select]').length,3);
  assert.equal(home('[data-pickup-select][aria-pressed="true"]').length,1);
  pickupItems.forEach(item=>{
    for(const asset of [item.poster,item.video].filter(Boolean)) assert.ok(fs.existsSync(resolveUrl(asset)),`Missing PICK UP media: ${asset}`);
    if(item.href.startsWith('/')) assert.ok(fs.existsSync(resolveUrl(item.href)),`Missing PICK UP destination: ${item.href}`);
    assert.ok(item.title && item.description && item.cta,'Complete PICK UP copy');
  });
  const homeCopy=parse(fs.readFileSync(`src/data/${prefix ? 'en' : 'zh-CN'}.yml`,'utf8')).index;
  assert.equal(clean(home('#pickup h1').text()),clean(homeCopy.title));
  assert.equal(clean(home('.pickup-description').text()),clean(homeCopy.text));
  assert.equal(clean(home('#pickup-introduction>p').text()),clean(homeCopy.text));
  assert.equal(home('.pickup-summary').length,0);
  assert.equal(home('[data-introduction-open]').length,3);
  assert.equal(home('.pickup-note-board .pickup-note-works').attr('href'),'#works');
  assert.equal(home('.pickup-note-empty').attr('aria-hidden'),'true');
  assert.equal(home('.pickup-expand .ui-icon use[href="/img/icon/library.svg#icon-window-down"]').length,1);
  home('[data-introduction-open]').each((_,trigger) => assert.equal(home(trigger).attr('href'),home('.pickup-actions .feature-button').attr('href')));
  assert.equal(home('#pickup .pickup-meta time').attr('datetime'),'2024-02-10');
  assert.equal(home('#pickup video source').attr('src'),'/img/MyBlog2024.webm');
  assert.equal(home('.pickup-scroll').attr('href'),'#introduction');
  assert.equal(home('.brand-white').attr('src'),'/images/moeqy-fff-logo.svg');
  assert.equal(home('.brand-white').attr('width'),home('.brand-color').attr('width'));
  assert.equal(home('.brand-white').attr('height'),home('.brand-color').attr('height'));
  assert.equal(home('.menu-toggle span').length,3);assert.equal(home('.menu-toggle small').length,0);
  assert.equal(home(`.header-language a[lang="${prefix ? 'zh-CN' : 'en'}"]`).attr('href'),prefix ? '/' : '/en/');
  assert.equal(about(`.header-language a[lang="${prefix ? 'zh-CN' : 'en'}"]`).attr('href'),prefix ? '/about/' : '/en/about/');
  const workData=JSON.parse(fs.readFileSync('src/data/works.json','utf8')).filter(work=>work.enabled);
  assert.equal(home('[data-work-panel]').length,workData.filter(work=>work.homeFeatured).length);
  assert.equal(new Set(workData.map(work=>work.id)).size,workData.length,'Unique work IDs');
  for(const work of workData){
    const text=work.text[prefix ? 'en' : 'zh-CN'] || work.text['zh-CN'];
    if(work.homeFeatured) {
      const panel=home(`#work-panel-${work.id}`);
      assert.equal(clean(panel.find('h3').text()),clean(text.title+(text.subtitle||'')));
      assert.equal(clean(panel.find('.works-copy>p').text()),clean(text.description));
      assert.equal(panel.find('.works-visit').attr('href'),work.href.startsWith('/') ? '/'+prefix+work.href.replace(/^\//,'') : work.href);
      assert.equal(panel.find('.works-visit').attr('target'),'_blank');
      assert.equal(panel.find('.works-detail-cover').attr('href'),`/${prefix}works/${work.id}/`);
    }
  }
  const directory=load(fs.readFileSync(resolveUrl(`/${prefix}works/`),'utf8'));
  assert.equal(directory('[data-work-panel]').length,workData.filter(work=>work.pageFeatured).length);
  assert.deepEqual(directory('[data-work-card]').map((_,el)=>directory(el).attr('data-work-card')).get(),workData.map(work=>work.id));
  assert.equal(directory('.side-nav [aria-current="page"] b').text(),'WORKS');
  assert.equal(home('.works-all-link a').attr('href'),`/${prefix}works/`);
  for(const work of workData) {
    const detailPath=`/${prefix}works/${work.id}/`;
    const detail=load(fs.readFileSync(resolveUrl(detailPath),'utf8'));
    assert.equal(detail('[data-work-detail]').attr('data-work-detail'),work.id);
    assert.equal(detail('h1').text(),work.text[prefix ? 'en' : 'zh-CN'].title);
    assert.ok(detail('.product-story h2').length);
    assert.equal(detail('.article-meta time').length,0);
    assert.equal(detail('.side-nav [aria-current="page"] b').text(),'WORKS');
    assert.equal(detail(`.header-language a[lang="${prefix ? 'zh-CN' : 'en'}"]`).attr('href'),`/${prefix ? '' : 'en/'}works/${work.id}/`);
    assert.ok(directory(`[data-work-card="${work.id}"] a[href="${detailPath}"]`).length >= 3);
  }
}
assert.ok(fs.existsSync(path.join(root,'sitemap.xml')));
console.log(`PASS: ${pages.length} pages; all ${legacy.length} legacy routes; ${sourcePosts.length} articles in both route namespaces; 6 complete documents; 14 FAQ answers; ${linkCount} internal links/assets; original archive pagination.`);
