import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { Window } from 'happy-dom';
const code=ts.transpileModule(fs.readFileSync('src/scripts/site.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function setup(file='dist/index.html', reducedMotion=false){
  const window=new Window({url:'https://www.moeqy.com/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  window.document.write(fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  if(reducedMotion){
    const matchMedia=window.matchMedia.bind(window);
    window.matchMedia=query=>{const media=matchMedia(query);if(query.includes('prefers-reduced-motion'))Object.defineProperty(media,'matches',{value:true});return media;};
  }
  window.eval(code);
  return window;
}

test('Three-language picker retains native links, closes outside and restores summary focus on Escape',()=>{
  for(const lang of ['', 'en/', 'ja/']) {
    const w=setup(`dist/${lang}index.html`,true),d=w.document;
    const menu=d.querySelector('.header-language-picker'),summary=menu.querySelector('summary');
    assert.deepEqual([...menu.querySelectorAll('a')].map(a=>a.getAttribute('lang')),['zh-CN','en','ja']);
    menu.open=true;menu.querySelector('a[lang=ja]').focus();
    d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(menu.open,false);assert.equal(d.activeElement,summary);
    menu.open=true;d.body.click();assert.equal(menu.open,false);
    const toggle=d.querySelector('.menu-toggle');toggle.click();
    assert.equal(d.querySelector('#site-menu').open,true);
    if(lang==='ja/')assert.equal(toggle.getAttribute('aria-label'),'メニューを閉じる');
    toggle.click();assert.equal(d.querySelector('#site-menu').open,false);
    w.happyDOM.abort();
  }
});
test('Interest tabs switch one panel at a time, and support arrow/Home/End keys',()=>{
  const w=setup();const tabs=[...w.document.querySelectorAll('.interest-tabs [role=tab]')];
  tabs[2].click();
  assert.equal(tabs[2].getAttribute('aria-selected'),'true');
  assert.equal(w.document.querySelectorAll('.interest-panel:not([hidden])').length,1);
  assert.equal(w.document.getElementById('interest-game').hidden,false);
  tabs[2].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(tabs[3].getAttribute('aria-selected'),'true');
  tabs[3].dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
  assert.equal(tabs[0].getAttribute('aria-selected'),'true');
  tabs[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));
  assert.equal(tabs[3].tabIndex,0);
  w.happyDOM.abort();
});
test('Interest collage keeps localized copy, artwork and focus together through rapid selection',()=>{
  const images=['moeqyGirlCat_','moeqyGirlGood_','moeqyGirlsmile_','moeqyGirlthinking_'];
  for(const file of ['dist/index.html','dist/en/index.html','dist/ja/index.html']) for(const reducedMotion of [false,true]) {
    const w=setup(file,reducedMotion); const d=w.document;
    const tabs=[...d.querySelectorAll('.interest-tabs [role=tab]')];
    assert.equal(d.querySelectorAll('.interest-panel:not([hidden])').length,1);
    for(const index of [3,1,2,0,2,3]) {
      tabs[index].click();
      const visible=[...d.querySelectorAll('.interest-panel:not([hidden])')];
      assert.equal(visible.length,1);
      assert.equal(visible[0].id,tabs[index].getAttribute('aria-controls'));
      assert.equal(visible[0].querySelector('h4').textContent,tabs[index].querySelector('span').textContent+'.');
      assert.ok(visible[0].querySelector('p').textContent.length>10);
      assert.ok(visible[0].querySelector('.interest-art img').src.includes(images[index]));
      assert.equal(visible[0].querySelector('img').src,tabs[index].querySelector('img').src);
      assert.equal(d.activeElement,tabs[index]);
      assert.equal(tabs.filter(t=>t.tabIndex===0).length,1);
    }
    w.happyDOM.abort();
  }
});
test('Interest collage server HTML exposes all four complete topics without JavaScript',()=>{
  for(const file of ['dist/index.html','dist/en/index.html','dist/ja/index.html']) {
    const w=new Window(); w.document.write(fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
    const panels=[...w.document.querySelectorAll('.interest-panel')];
    assert.equal(panels.length,4);
    assert.ok(panels.every(p=>!p.hidden && p.querySelector('p').textContent.length>10 && p.querySelector('img')));
    assert.equal(w.document.querySelector('.interest-collage').hasAttribute('data-tabs-ready'),false);
    w.happyDOM.abort();
  }
});
test('Video iframe loads only on demand and is removed when the dialog closes',()=>{
  const w=setup();const d=w.document; const dialog=d.getElementById('video-dialog');
  assert.equal(d.querySelectorAll('.video-embed iframe').length,0);
  d.querySelector('[data-video-surface]').click();
  assert.equal(dialog.open,false,'The background must not open the video');
  d.querySelector('[data-video-open]').click();
  assert.equal(dialog.open,true);
  assert.match(d.querySelector('.video-embed iframe').src,/BV1g4421F7VL/);
  dialog.querySelector('[data-close-dialog]').click();
  assert.equal(dialog.open,false);
  assert.equal(d.querySelectorAll('.video-embed iframe').length,0);
  d.querySelector('[data-video-open]').click();
  assert.equal(d.querySelectorAll('.video-embed iframe').length,1);
  dialog.close();w.happyDOM.abort();
});
test('Event introduction preserves full copy and its fallback link; button, Escape and backdrop restore focus',()=>{
  for (const file of ['dist/index.html','dist/en/index.html','dist/ja/index.html']) {
    const w=setup(file);const d=w.document;const triggers=[...d.querySelectorAll('[data-introduction-open]')];const dialog=d.getElementById('pickup-introduction');
    assert.equal(triggers.length,3);
    for (const trigger of triggers) {
    assert.equal(trigger.getAttribute('href'),d.querySelector('.pickup-actions .feature-button').getAttribute('href'));
    assert.equal(dialog.querySelector('p').textContent,d.querySelector('.pickup-description').textContent);
    const open=()=>{trigger.click();assert.equal(dialog.open,true);};
    const closed=()=>{assert.equal(dialog.open,false);assert.equal(d.activeElement,trigger);};
    open();dialog.querySelector('[data-close-dialog]').click();closed();
    open();dialog.dispatchEvent(new w.Event('cancel',{cancelable:true}));closed();
    open();dialog.dispatchEvent(new w.MouseEvent('click',{clientX:-10,clientY:-10,bubbles:true}));closed();
    assert.equal(d.querySelectorAll('.video-embed iframe').length,0);
    }
    w.happyDOM.abort();
  }
});
test('Mobile menu keeps one usable control, closes by link/button/Escape/backdrop and restores focus',async()=>{
  const w=setup();const d=w.document;const toggle=d.querySelector('.menu-toggle'); const menu=d.getElementById('site-menu');
  const closed=async()=>{await new Promise(resolve=>setTimeout(resolve,340));assert.equal(menu.open,false);assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(d.activeElement,toggle);assert.ok(toggle.closest('.site-header'));};
  toggle.click();assert.equal(menu.open,true);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.ok(menu.contains(toggle));assert.equal(toggle.getAttribute('aria-label'),'关闭菜单');
  assert.ok(d.querySelector('.site-header .menu-slot'));assert.equal(d.querySelector('.menu-slot .menu-toggle'),null);
  menu.querySelector('a').addEventListener('click',event=>event.preventDefault());
  menu.querySelector('a').click();await closed();
  toggle.click();toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');await closed();
  toggle.click();menu.dispatchEvent(new w.Event('cancel',{cancelable:true}));await closed();
  toggle.click();menu.dispatchEvent(new w.MouseEvent('click',{clientX:-10,clientY:-10,bubbles:true}));await closed();
  assert.equal(d.querySelectorAll('.menu-toggle').length,1);assert.equal(toggle.getAttribute('aria-label'),'打开菜单');
  assert.ok(toggle.closest('.menu-slot'));
  w.happyDOM.abort();
});
test('Reduced motion closes the menu immediately, including on English pages',()=>{
  const w=setup('dist/en/index.html',true);const toggle=w.document.querySelector('.menu-toggle');const menu=w.document.getElementById('site-menu');
  toggle.click();assert.equal(toggle.getAttribute('aria-label'),'Close menu');toggle.click();assert.equal(menu.open,false);assert.equal(toggle.getAttribute('aria-label'),'Open menu');
  w.happyDOM.abort();
});
test('Privacy dismissal is page-local, and passport explains the original internal-only status',()=>{
  const w=setup();const d=w.document;
  d.querySelector('[data-dismiss-notice]').click();assert.equal(d.querySelector('.privacy-notice').classList.contains('dismissed'),true);
  assert.equal(w.localStorage.length,0);
  d.querySelector('[data-account]').click();assert.equal(d.getElementById('account-dialog').open,true);
  assert.match(d.getElementById('account-dialog').textContent,/内部测试/);
  d.getElementById('account-dialog').close();w.happyDOM.abort();
});
test('FAQ categories retain expanded answers when switching back',()=>{
  const w=setup('dist/faq/index.html');const d=w.document;const tabs=[...d.querySelectorAll('.faq-tabs [role=tab]')];
  tabs[1].click();const video=d.getElementById('faq-panel-1');assert.equal(video.hidden,false);
  const item=video.querySelector('details');item.querySelector('summary').click();assert.equal(item.open,true);
  tabs[2].click();assert.equal(video.hidden,true);assert.equal(d.getElementById('faq-panel-2').hidden,false);
  tabs[1].click();assert.equal(item.open,true);
  assert.equal(d.querySelectorAll('.faq-panel:not([hidden])').length,1);w.happyDOM.abort();
});
test('Shared script runs on article pages that have no homepage controls',()=>{
  const w=setup('dist/gonggao/20250708/post-1/index.html');
  w.document.querySelector('.menu-toggle').click();assert.equal(w.document.getElementById('site-menu').open,true);
  w.document.getElementById('site-menu').close();w.happyDOM.abort();
});
