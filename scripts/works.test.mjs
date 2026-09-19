import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { Window } from 'happy-dom';

const code = ts.transpileModule(fs.readFileSync('src/scripts/works.ts','utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function setup({ reduced=false, count=2, lang='', page='' }={}) {
  const w = new Window({url:'https://www.moeqy.com/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  w.document.write(fs.readFileSync(`dist/${lang}${page}index.html`,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  const root=w.document.querySelector('[data-works]');
  [...root.querySelectorAll('[data-work-panel]')].slice(count).forEach(e=>e.remove());
  [...root.querySelectorAll('[data-work-tab]')].slice(count).forEach(e=>e.remove());
  if(count<2)root.querySelector('[data-work-controls]').remove();
  const panels=[...root.querySelectorAll('[data-work-panel]')];
  const tabs=[...root.querySelectorAll('[data-work-tab]')];
  let now=0, nextId=1, hidden=false, intersection;
  const timers=new Map();
  const animations=[];
  w.Element.prototype.animate=function(keyframes,options) {
    const record={target:this,keyframes,options,paused:false,cancelled:false};
    animations.push(record);
    return {pause(){record.paused=true;},cancel(){record.cancelled=true;}};
  };
  w.setTimeout=(fn,delay)=>{const id=nextId++;timers.set(id,{fn,at:now+delay});return id;};
  w.clearTimeout=id=>timers.delete(id);
  Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  const media=new w.EventTarget();media.matches=reduced;
  w.matchMedia=query=>query.includes('prefers-reduced-motion') ? media : {matches:false};
  w.IntersectionObserver=class {constructor(callback){intersection=callback;}observe(){}disconnect(){}};
  const advance=ms=>{const until=now+ms;for(;;){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>until)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=until;};
  w.eval(code);
  return {w,root,panels,tabs,advance,media,timers,animations,
    visible:value=>intersection?.([{isIntersecting:value}]),
    hidden:value=>{hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));},
    active:()=>panels.findIndex(p=>p.classList.contains('is-active')),
    close:()=>w.happyDOM.abort()};
}

test('Works rotate every 10 seconds, loop, and restart after returning to view or the page',()=>{
  const s=setup();assert.equal(s.active(),0);s.advance(30000);assert.equal(s.active(),0);
  s.visible(true);s.advance(9999);assert.equal(s.active(),0);s.advance(1);assert.equal(s.active(),1);
  s.advance(10000);assert.equal(s.active(),0);
  s.visible(false);s.advance(30000);assert.equal(s.active(),0);assert.equal(s.timers.size,0);
  s.visible(true);s.advance(10000);assert.equal(s.active(),1);
  s.hidden(true);s.advance(30000);assert.equal(s.active(),1);
  s.hidden(false);s.advance(9999);assert.equal(s.active(),1);s.advance(1);assert.equal(s.active(),0);
  assert.equal(s.root.querySelector('[data-work-announcement]').textContent,'');s.close();
});
test('Manual selection restarts the interval; rapid controls and keyboard keep only the selected work interactive',()=>{
  const s=setup();s.visible(true);s.advance(6000);s.tabs[1].click();assert.equal(s.active(),1);
  s.advance(9999);assert.equal(s.active(),1);s.advance(1);assert.equal(s.active(),0);
  for(let i=0;i<5;i++)s.root.querySelector('[data-work-next]').click();assert.equal(s.active(),1);
  s.root.querySelector('[data-work-prev]').click();assert.equal(s.active(),0);
  for(const [key,expected] of [['End',1],['Home',0],['ArrowLeft',1],['ArrowRight',0]]){
    s.tabs[s.active()].dispatchEvent(new s.w.KeyboardEvent('keydown',{key,bubbles:true}));
    assert.equal(s.active(),expected);assert.equal(s.w.document.activeElement,s.tabs[expected]);
    assert.equal(s.panels[1-expected].inert,true);assert.equal(s.panels[expected].inert,false);
    assert.equal(s.tabs.filter(t=>t.tabIndex===0).length,1);
  }
  s.advance(20000);assert.equal(s.active(),0);assert.match(s.root.querySelector('[data-work-announcement]').textContent,/CONCEPTS GAME/);s.close();
});
test('Hover, keyboard focus and explicit pause are independent pause reasons',()=>{
  const s=setup();s.visible(true);
  s.root.querySelector('.works-copy').dispatchEvent(new s.w.PointerEvent('pointerenter',{pointerType:'mouse'}));s.advance(20000);assert.equal(s.active(),0);
  s.root.querySelector('.works-copy').dispatchEvent(new s.w.PointerEvent('pointerleave',{pointerType:'mouse'}));s.advance(10000);assert.equal(s.active(),1);
  s.tabs[1].focus();s.advance(20000);assert.equal(s.active(),1);
  s.w.document.body.tabIndex=-1;s.w.document.body.focus();s.advance(10000);assert.equal(s.active(),0);
  const play=s.root.querySelector('[data-work-play]');play.click();assert.equal(play.getAttribute('aria-label'),'播放轮播');
  s.visible(false);s.visible(true);s.hidden(true);s.hidden(false);s.advance(30000);assert.equal(s.active(),0);
  play.click();s.advance(10000);assert.equal(s.active(),1);s.close();
});
test('Reduced motion starts paused and a later preference change stops an active slideshow',()=>{
  const s=setup({reduced:true,lang:'en/'});s.visible(true);s.advance(30000);assert.equal(s.active(),0);
  const play=s.root.querySelector('[data-work-play]');assert.equal(play.getAttribute('aria-label'),'Play slideshow');
  play.click();s.advance(10000);assert.equal(s.active(),1);
  s.media.dispatchEvent(new s.w.Event('change'));s.advance(20000);assert.equal(s.active(),1);
  s.media.matches=false;s.media.dispatchEvent(new s.w.Event('change'));s.advance(20000);assert.equal(s.active(),1);s.close();
});

test('Only work copy hover pauses; the selected ring freezes and restarts with the timer',()=>{
  const s=setup();s.visible(true);
  const pointer=(el,type)=>el.dispatchEvent(new s.w.PointerEvent(type,{pointerType:'mouse'}));
  for(const selector of ['.works-poster','.works-thumb','[data-work-controls]']) {
    pointer(s.root,'pointerenter');pointer(s.root.querySelector(selector),'pointerenter');
    s.advance(10000);
  }
  assert.equal(s.active(),1);
  const ring=s.animations.at(-1);
  assert.equal(ring.target,s.tabs[1].querySelector('[data-work-progress]'));
  assert.equal(ring.options.duration,10000);
  assert.deepEqual(Array.from(ring.keyframes,frame=>frame.strokeDashoffset),['0','100']);
  s.advance(4000);
  pointer(s.panels[1].querySelector('.works-copy'),'pointerenter');
  assert.equal(ring.paused,true);assert.equal(ring.cancelled,false);
  s.advance(20000);assert.equal(s.active(),1);
  pointer(s.panels[1].querySelector('.works-copy'),'pointerleave');
  assert.equal(ring.cancelled,true);assert.notEqual(s.animations.at(-1),ring);
  s.advance(9999);assert.equal(s.active(),1);s.advance(1);assert.equal(s.active(),0);
  s.tabs[1].click();assert.equal(s.animations.at(-1).target,s.tabs[1].querySelector('[data-work-progress]'));
  s.hidden(true);assert.equal(s.animations.at(-1).paused,true);s.close();
  const reduced=setup({reduced:true});reduced.visible(true);
  reduced.root.querySelector('[data-work-play]').click();
  assert.equal(reduced.animations.length,0);reduced.close();
});
test('Zero or one work needs no carousel, and server markup exposes all original project links without JavaScript',()=>{
  for(const count of [0,1]){const s=setup({count});assert.equal(s.root.classList.contains('is-carousel'),false);assert.equal(s.timers.size,0);assert.equal(s.root.querySelector('[data-work-controls]'),null);s.close();}
  const w=new Window({settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  w.document.write(fs.readFileSync('dist/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  assert.equal(w.document.querySelectorAll('[data-work-panel]:not([hidden]):not([inert])').length,2);
  assert.equal(w.document.querySelector('[data-work-controls]').hidden,true);
  assert.deepEqual([...w.document.querySelectorAll('.works-visit')].map(a=>a.getAttribute('href')),['/conceptsgame/','https://blog.moeqy.com/']);w.happyDOM.abort();
});

test('Directory recommendation carousel shares timing, keyboard and inert detail-link behavior in all three languages',()=>{
  for(const lang of ['', 'en/', 'ja/']) {
    const s=setup({lang,page:'works/'});s.visible(true);
    s.advance(10000);assert.equal(s.active(),1);
    s.panels[1].querySelector('.works-copy').dispatchEvent(new s.w.PointerEvent('pointerenter',{pointerType:'mouse'}));
    s.advance(20000);assert.equal(s.active(),1);
    s.panels[1].querySelector('.works-copy').dispatchEvent(new s.w.PointerEvent('pointerleave',{pointerType:'mouse'}));
    s.tabs[1].dispatchEvent(new s.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    assert.equal(s.active(),0);assert.equal(s.w.document.activeElement,s.tabs[0]);
    assert.equal(s.panels[1].inert,true);
    assert.equal(s.panels[0].querySelector('.works-detail-cover').getAttribute('href'),`/${lang}works/conceptsgame/`);
    assert.equal(s.w.document.querySelectorAll('[data-work-card]').length,2);
    s.close();
  }
});
