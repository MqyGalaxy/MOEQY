import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { Window } from 'happy-dom';
const code=ts.transpileModule(fs.readFileSync('src/scripts/work-store.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const setup=(route)=>{
  const w=new Window({url:`https://www.moeqy.com/${route}`,settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  w.document.write(fs.readFileSync(`dist/${route}index.html`,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  return {w,d:w.document,start:()=>w.eval(code),close:()=>w.happyDOM.abort()};
};
test('Store filters combine keyword and category, preserve original sort and reset empty results in all three languages',()=>{
  for(const prefix of ['', 'en/', 'ja/']) {
    const s=setup(`${prefix}works/`),d=s.d;
    const cards=[...d.querySelectorAll('[data-work-card]')];
    assert.equal(d.querySelector('[data-catalog-tools]').hidden,true);
    assert.ok(cards.every(card=>!card.hidden));
    cards[0].dataset.title='Z project';cards[1].dataset.title='A project';
    s.start();
    const search=d.querySelector('[data-catalog-search]'),sort=d.querySelector('[data-catalog-sort]');
    const visible=()=>[...d.querySelectorAll('[data-work-card]')].filter(el=>!el.hidden).map(el=>el.dataset.workCard);
    search.value='  MYBLOG ';search.dispatchEvent(new s.w.Event('input'));
    assert.deepEqual(visible(),['myblog']);assert.equal(d.querySelector('[data-catalog-count]').textContent,'1');
    d.querySelector('[data-category-filter="GAME / CONCEPT"]').click();
    assert.deepEqual(visible(),[]);assert.equal(d.querySelector('[data-catalog-empty]').hidden,false);
    d.querySelector('[data-catalog-reset]').click();assert.equal(d.activeElement,search);
    assert.deepEqual(visible(),['conceptsgame','myblog']);
    sort.value='name';sort.dispatchEvent(new s.w.Event('change'));assert.deepEqual(visible(),['myblog','conceptsgame']);
    sort.value='default';sort.dispatchEvent(new s.w.Event('change'));assert.deepEqual(visible(),['conceptsgame','myblog']);
    search.value='<script>';search.dispatchEvent(new s.w.Event('input'));assert.equal(visible().length,0);
    s.close();
  }
});
test('Product gallery switches image, caption and selection together by click and keyboard, preserving original links',()=>{
  for(const prefix of ['', 'en/', 'ja/']) {
    const s=setup(`${prefix}works/myblog/`),d=s.d;
    assert.equal(d.querySelectorAll('.article-heading,.article-reading').length,0);
    assert.equal(d.querySelector('[data-gallery-controls]').hidden,true);
    const image=d.querySelector('[data-gallery-image]');assert.equal(image.getAttribute('src'),'/img/blog.jpg');
    s.start();const buttons=[...d.querySelectorAll('[data-gallery-src]')];
    for(const index of [1,0,1]) {buttons[index].click();assert.equal(image.src,buttons[index].dataset.gallerySrc.startsWith('/')?'https://www.moeqy.com'+buttons[index].dataset.gallerySrc:buttons[index].dataset.gallerySrc);}
    buttons[1].dispatchEvent(new s.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    assert.equal(d.activeElement,buttons[0]);assert.equal(image.getAttribute('src'),'/img/blog.jpg');
    buttons[0].dispatchEvent(new s.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
    assert.equal(d.activeElement,buttons[1]);assert.equal(d.querySelector('[data-gallery-caption]').textContent,buttons[1].dataset.galleryLabel);
    assert.equal(buttons.filter(button=>button.getAttribute('aria-pressed')==='true').length,1);
    assert.equal(d.querySelector('.product-primary').getAttribute('href'),'https://blog.moeqy.com/');
    assert.equal(d.querySelectorAll('h1').length,1);s.close();
  }
});
