import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { Window } from 'happy-dom';

const compile = file => ts.transpileModule(fs.readFileSync(file,'utf8').replace(/^import type .*;\r?\n/m,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const siteCode=compile('src/scripts/site.ts'), pickupCode=compile('src/scripts/pickup.ts');
function setup({lang='',reduced=false}={}) {
  const w=new Window({url:'https://www.moeqy.com/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  w.document.write(fs.readFileSync(`dist/${lang}index.html`,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>tag.includes('application/json')?tag:''));
  const root=w.document.querySelector('#pickup');
  const items=JSON.parse(root.querySelector('[data-pickup-data]').textContent);
  const buttons=[...root.querySelectorAll('[data-pickup-select]')];
  const controls=root.querySelector('[data-pickup-controls]');
  const animations=[];
  w.Element.prototype.animate=function(keyframes) {
    const record={target:this,keyframes,cancelled:false};animations.push(record);
    return {finished:Promise.resolve(),cancel(){record.cancelled=true;}};
  };
  let now=0,id=0,hidden=false,intersection;
  const timers=new Map();
  w.setTimeout=(fn,delay)=>{const key=++id;timers.set(key,{fn,at:now+delay});return key;};
  w.clearTimeout=key=>timers.delete(key);
  w.requestAnimationFrame=()=>0;
  w.HTMLMediaElement.prototype.play=()=>Promise.resolve();
  w.HTMLMediaElement.prototype.pause=()=>{};
  w.HTMLMediaElement.prototype.load=()=>{};
  Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  const media=new w.EventTarget();media.matches=reduced;
  w.matchMedia=query=>query.includes('prefers-reduced-motion')?media:{matches:false,addEventListener(){}};
  w.IntersectionObserver=class {constructor(callback){this.callback=callback;}observe(target){if(target===root)intersection=this.callback;}unobserve(){}};
  const advance=ms=>{const until=now+ms;for(;;){const pair=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!pair||pair[1].at>until)break;now=pair[1].at;timers.delete(pair[0]);pair[1].fn();}now=until;};
  w.eval(siteCode);w.eval(pickupCode);
  return {w,root,items,buttons,controls,advance,media,animations,
    active:()=>items.findIndex(item=>item.id===root.dataset.pickupId),
    visible:value=>intersection([{isIntersecting:value}]),
    hidden:value=>{hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));},
    close:()=>w.happyDOM.abort()};
}

test('PICK UP switches all three localized visuals, links and full introductions together, then restores video',()=>{
  for(const lang of ['', 'en/', 'ja/']) {
    const s=setup({lang}); const {root,items,w}=s;
    for(const i of [1,2,0]) {
      s.buttons[i].click(); const item=items[i];
      assert.equal(root.querySelector('h1').textContent,item.title);
      assert.equal(root.querySelector('.pickup-description').textContent,item.description);
      assert.equal(root.querySelector('.feature-button').getAttribute('href'),item.href);
      assert.equal(root.querySelector('.pickup-poster').getAttribute('src'),item.poster);
      assert.equal(root.querySelector('.pickup-note-film img').getAttribute('src'),item.poster);
      assert.equal(root.querySelector('.pickup-note-story').getAttribute('href'),item.href);
      assert.equal(root.querySelector('video').hidden,!item.video);
      const play = root.querySelector('[data-video-open]');
      assert.equal(play.hidden, !item.video || !item.player);
      root.querySelector('[data-video-surface]').click();
      assert.equal(w.document.querySelector('#video-dialog').open,false);
      if (!item.video) {
        play.click();
        assert.equal(w.document.querySelectorAll('iframe').length,0,'An image-only item cannot open a player');
        assert.equal(w.location.href,'https://www.moeqy.com/','The background cannot navigate to the work');
      }
      assert.equal(w.document.querySelector('#pickup-introduction>p').textContent,item.description);
      assert.equal(w.document.querySelector('#pickup-introduction .pill-button').getAttribute('href'),item.href);
      assert.equal(s.buttons.filter(button=>button.getAttribute('aria-pressed')==='true').length,1);
      assert.equal(w.document.querySelectorAll('h1').length,1);
    }
    root.querySelector('[data-video-open]').click();
    assert.equal(w.document.querySelector('iframe').src,items[0].player);
    w.document.querySelector('#video-dialog [data-close-dialog]').click();
    assert.equal(w.document.querySelectorAll('iframe').length,0);
    s.close();
  }
});
test('PICK UP rotates every ten seconds, loops, and pauses independently for visibility, hover, focus and explicit pause',()=>{
  const s=setup(); s.visible(true);
  s.advance(9999);assert.equal(s.active(),0);s.advance(1);assert.equal(s.active(),1);
  s.advance(10000);assert.equal(s.active(),2);s.advance(10000);assert.equal(s.active(),0);
  s.visible(false);s.advance(20000);assert.equal(s.active(),0);
  s.visible(true);s.hidden(true);s.advance(20000);assert.equal(s.active(),0);
  s.hidden(false);s.root.querySelector('.pickup-info').dispatchEvent(new s.w.PointerEvent('pointerenter',{pointerType:'mouse'}));s.advance(20000);assert.equal(s.active(),0);
  s.root.querySelector('.pickup-info').dispatchEvent(new s.w.PointerEvent('pointerleave',{pointerType:'mouse'}));
  s.buttons[0].focus();s.advance(20000);assert.equal(s.active(),0);
  s.w.document.body.tabIndex=-1;s.w.document.body.focus();
  const pause=s.root.querySelector('[data-pickup-pause]');pause.click();
  s.visible(false);s.visible(true);s.advance(20000);assert.equal(s.active(),0);
  pause.click();s.advance(10000);assert.equal(s.active(),1);s.close();
});
test('Manual PICK UP changes restart the timer; keyboard and rapid selection retain the last selected item',()=>{
  const s=setup();s.visible(true);s.advance(9000);s.buttons[2].click();s.advance(9999);assert.equal(s.active(),2);s.advance(1);assert.equal(s.active(),0);
  for(const [key,expected] of [['End',2],['Home',0],['ArrowLeft',2],['ArrowRight',0]]) {
    s.buttons[s.active()].dispatchEvent(new s.w.KeyboardEvent('keydown',{key,bubbles:true}));
    assert.equal(s.active(),expected);assert.equal(s.w.document.activeElement,s.buttons[expected]);
  }
  for(const i of [1,0,2,1,2])s.buttons[i].click();
  assert.equal(s.active(),2);assert.equal(s.buttons.filter(button=>button.tabIndex===0).length,1);
  assert.match(s.root.querySelector('.pickup-announcement').textContent,/3 \/ 3/);s.close();
});

test('PICK UP media and controls hover keep rotating while information hover pauses',()=>{
  const s=setup();s.visible(true);
  const pointer=(el,type)=>el.dispatchEvent(new s.w.PointerEvent(type,{pointerType:'mouse'}));
  pointer(s.root,'pointerenter');pointer(s.root.querySelector('[data-video-surface]'),'pointerenter');
  s.advance(10000);assert.equal(s.active(),1);
  pointer(s.controls,'pointerenter');s.advance(10000);assert.equal(s.active(),2);
  pointer(s.root.querySelector('.pickup-info'),'pointerenter');s.advance(20000);assert.equal(s.active(),2);
  pointer(s.root.querySelector('.pickup-info'),'pointerleave');s.advance(9999);assert.equal(s.active(),2);
  s.advance(1);assert.equal(s.active(),0);s.close();
});

test('Rapid visual switches leave background media stationary and cancel stale foreground animations',()=>{
  const s=setup();
  for(const i of [1,2,0,2,0])s.buttons[i].click();
  assert.equal(s.active(),0);
  assert.ok(s.animations.length>0,'Foreground entrance is retained');
  assert.ok(s.animations.every(animation=>!animation.target.closest('[data-video-surface]')),'No decoding video or clipped background gets a separate animation');
  assert.equal(s.animations.filter(animation=>!animation.cancelled).length,1);
  s.media.matches=true;s.media.dispatchEvent(new s.w.Event('change'));
  assert.ok(s.animations.every(animation=>animation.cancelled));
  s.close();
});
test('PICK UP reduced motion starts paused; an open introduction keeps its content and returns focus',async()=>{
  const s=setup({lang:'en/',reduced:true});s.visible(true);s.advance(30000);assert.equal(s.active(),0);
  s.buttons[1].click();
  const trigger=s.root.querySelector('.pickup-expand');trigger.click();
  await Promise.resolve();
  const dialog=s.w.document.querySelector('#pickup-introduction');
  assert.equal(dialog.open,true);assert.equal(dialog.querySelector('p').textContent,s.items[1].description);
  s.root.querySelector('[data-pickup-pause]').click();s.advance(20000);assert.equal(s.active(),1);
  dialog.dispatchEvent(new s.w.Event('cancel',{cancelable:true}));
  assert.equal(dialog.open,false);assert.equal(s.w.document.activeElement,trigger);
  s.media.dispatchEvent(new s.w.Event('change'));assert.equal(s.controls.dataset.paused,'true');s.close();
});
