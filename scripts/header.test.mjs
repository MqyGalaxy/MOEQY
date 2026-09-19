import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { Window } from 'happy-dom';

const code = ts.transpileModule(fs.readFileSync('src/scripts/site.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function setup({ home = true, scroll = 0, reduced = false, mobile = false, graphic = false, notes = false } = {}) {
  const w = new Window();
  w.document.write(`<header class="site-header" style="padding-left:50px;--header-expanded:108px;--brand-expanded:180px">
    <a class="brand"></a><a class="header-language"></a></header>${home ? '<button data-video-surface></button>' : ''}`);
  const header = w.document.querySelector('header');
  let height = 900, width = 1251, position = scroll;
  const frames = [];
  w.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  Object.defineProperty(w, 'scrollY', { get: () => position });
  const matchMedia = w.matchMedia.bind(w);
  w.matchMedia = query => { const media = matchMedia(query); if (query.includes('prefers-reduced-motion')) Object.defineProperty(media, 'matches', { value: reduced }); return media; };
  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  header.getBoundingClientRect = () => box(0, 0, 1251, 108);
  w.document.querySelector('.header-language').getBoundingClientRect = () => box(1150, 40, 40, 28);
  if (home) {
    const video = w.document.querySelector('[data-video-surface]');
    video.dataset.curve = JSON.stringify([[0,.9],[1/3,.9],[2/3,.2],[1,.2]]);
    if (graphic) {
      const component = fs.readFileSync('src/components/PickupHero.astro', 'utf8');
      video.dataset.curve = JSON.stringify(JSON.parse(component.match(/const desktopCurve = (\[.*\]);/)[1].replace(/(?<=[,\[])\./g, '0.')));
      video.innerHTML = '<span class="pickup-graphic" style="left:50px"></span>';
      video.firstElementChild.getBoundingClientRect = () => box(50, 0, 650, 250);
    }
    if (mobile) {
      video.style.cssText = '--video-profile:mobile;--folder-rise:40px;--folder-run:72px';
      w.document.body.insertAdjacentHTML('beforeend','<svg class="pickup-paper-cover"><clipPath id="pickup-curve-mobile"><path></path></clipPath><path id="pickup-paper-mobile-shape"></path><pattern id="pickup-paper-dots"><ellipse></ellipse></pattern><ellipse class="pickup-paper-accent"></ellipse></svg>');
      w.document.querySelector('.pickup-paper-cover').getBoundingClientRect = () => box(0, -position, width, height + 300);
    }
    video.getBoundingClientRect = () => box(0, -position, width, height);
    if (notes) {
      const section = w.document.createElement('section');
      section.id = 'pickup';
      w.document.body.append(section);
      section.append(video);
      section.insertAdjacentHTML('beforeend','<div class="pickup-note-board"></div><div data-pickup-controls><span class="pickup-visual-image"></span></div><div class="pickup-info"></div>');
      const board = section.querySelector('.pickup-note-board');
      const controls = section.querySelector('[data-pickup-controls]');
      section.getBoundingClientRect = () => box(0,-position,width,height+300);
      board.getBoundingClientRect = () => box(20,parseFloat(board.style.getPropertyValue('--notes-top') || '0')-position,width-40,parseFloat(board.style.getPropertyValue('--notes-height') || '100'));
      controls.getBoundingClientRect = () => box(20,height+300-parseFloat(controls.style.getPropertyValue('--visual-bottom') || '0')-48-position,width-40,48);
      controls.firstElementChild.getBoundingClientRect = () => box(20,controls.getBoundingClientRect().top+18,55,30);
    }
  }
  w.eval(code);
  return {
    w, header, frames,
    value: name => Number(header.style.getPropertyValue(name)),
    flush: () => { const pending = frames.splice(0); pending.forEach(callback => callback(0)); },
    move: (value, event = 'scroll') => { position = value; w.dispatchEvent(new w.Event(event)); },
    resize: () => { height = 1100; w.dispatchEvent(new w.Event('resize')); },
    resizeTo: (nextWidth,nextHeight) => { width=nextWidth; height=nextHeight; w.dispatchEvent(new w.Event('resize')); },
    crossing: () => { const t = 140 / 1251; return height * (.9 - 2.1 * t**2 + 1.4 * t**3) - 54; },
  };
}

test('Mobile cards sit across the seam, keep controls clear, and simplify for both narrow and short viewports', () => {
  const s=setup({mobile:true,notes:true});
  const section=s.w.document.querySelector('#pickup');
  const board=section.querySelector('.pickup-note-board');
  const controls=section.querySelector('[data-pickup-controls]');
  const info=section.querySelector('.pickup-info');
  for (const [width,height,density] of [[753,676,'full'],[375,676,'compact'],[280,676,'essential'],[753,400,'compact'],[753,250,'essential'],[753,676,'full']]) {
    s.resizeTo(width,height); s.flush();
    assert.equal(board.dataset.density,density,`${width} × ${height}`);
    const rect=board.getBoundingClientRect();
    assert.ok(rect.top<height-40 && rect.bottom>height,'cards must straddle the folder seam');
    assert.ok(rect.height>=48,'even essential cards retain a 48px touch target');
    assert.ok(controls.getBoundingClientRect().bottom<=rect.top-13.9,'switcher stays above the cards');
    assert.ok(height+parseFloat(info.style.getPropertyValue('--notes-info-inset'))>=rect.bottom+19.9,'copy starts below the card footprint');
    const top=rect.top;
    s.move(140); s.flush();
    assert.ok(Math.abs(board.getBoundingClientRect().top+140-top)<.001,'scroll cannot move cards within the hero');
    s.move(0); s.flush();
  }
  s.w.happyDOM.abort();
});

test('Compact PICK UP aligns 8px above the visible thumbnails, independent of button padding and scroll', () => {
  const s=setup({mobile:true,notes:true,graphic:true});
  const d=s.w.document, graphic=d.querySelector('.pickup-graphic');
  for(const width of [375,280]) {
    s.resizeTo(width,500); s.flush();
    for(const scroll of [0,120]) {
      s.move(scroll); s.flush();
      const image=d.querySelector('.pickup-visual-image').getBoundingClientRect();
      const video=d.querySelector('[data-video-surface]').getBoundingClientRect();
      assert.equal(parseFloat(graphic.style.getPropertyValue('--compact-graphic-left')),image.left-video.left);
      assert.ok(Math.abs(video.bottom-parseFloat(graphic.style.getPropertyValue('--compact-graphic-bottom'))-(image.top-8))<.001);
    }
  }
  s.resizeTo(753,676); s.flush();
  assert.equal(graphic.style.getPropertyValue('--compact-graphic-bottom'),'','full decoration restores its original positioning');
  s.w.happyDOM.abort();
});

test('PICK UP aligns to the visible desktop bottom with a fixed inset and stays within the flat edge', () => {
  const s = setup({ graphic: true });
  const graphic = s.w.document.querySelector('.pickup-graphic');
  const value = key => parseFloat(graphic.style.getPropertyValue(key));
  assert.ok(Math.abs(value('--graphic-bottom') - 47.5) < .001);
  assert.ok(50 + value('--graphic-width') < 1251 * .24);
  s.move(350); s.flush();
  assert.ok(Math.abs(value('--graphic-bottom') - 47.5) < .001, 'scroll must not shift decoration within the video');
  s.resize(); s.flush();
  assert.ok(Math.abs(value('--graphic-bottom') - 54.5) < .001);
  s.w.happyDOM.abort();
});

test('PICK UP clears the raised mobile folder edge by 12px without stretching the shoulder', () => {
  const s = setup({ graphic: true, mobile: true });
  const graphic = s.w.document.querySelector('.pickup-graphic');
  assert.ok(Math.abs(parseFloat(graphic.style.getPropertyValue('--graphic-bottom')) - 52) < .001);
  assert.equal(graphic.style.getPropertyValue('--graphic-width'), '');
  s.resize(); s.flush();
  assert.ok(Math.abs(parseFloat(graphic.style.getPropertyValue('--graphic-bottom')) - 52) < .001);
  s.w.happyDOM.abort();
});

test('Header follows the actual curved video boundary, then shrinks over 160px, and reverses without hiding the logo', () => {
  const s = setup();
  assert.equal(s.header.dataset.headerState, 'video');
  assert.equal(s.value('--logo-white'), 1);
  assert.equal(s.value('--header-background'), 0);
  assert.equal(s.w.document.querySelector('.header-language').dataset.onVideo, 'true');
  s.move(s.crossing()); s.flush();
  assert.ok(Math.abs(s.value('--logo-white') - .5) < .001);
  assert.ok(Math.abs(s.value('--header-background') - .5) < .001);
  assert.equal(s.value('--header-progress'), 0);
  s.move(s.crossing() + 24.01); s.flush();
  assert.equal(s.header.dataset.headerState, 'color');
  assert.ok(Math.abs(s.value('--header-background') - 1) < .001);
  s.move(s.crossing() + 104); s.flush();
  assert.ok(Math.abs(s.value('--header-progress') - .5) < .001);
  assert.equal(s.value('--header-background'), 1);
  s.move(s.crossing() + 185); s.flush();
  assert.equal(s.header.dataset.headerState, 'compact');
  assert.equal(s.value('--header-background'), 1);
  s.move(0); s.flush();
  assert.equal(s.header.dataset.headerState, 'video');
  assert.equal(s.value('--header-background'), 0);
  s.w.happyDOM.abort();
});

test('Mobile folder shoulder keeps its physical rise and width after the video resizes', () => {
  const s = setup({ mobile: true });
  const shoulder = height => {
    const numbers = s.w.document.querySelector('#pickup-curve-mobile path').getAttribute('d').match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi).map(Number).slice(2,-2);
    const points = Array.from({length:numbers.length/2},(_,i)=>numbers.slice(i*2,i*2+2));
    assert.ok(Math.abs((points[12][0]-points[3][0])*1251-72)<.001);
    assert.ok(Math.abs((1-points[15][1])*height-40)<.001);
    assert.equal(points[0][1],points[3][1]);
    assert.equal(points[12][1],points[15][1]);
    // At every join, incoming/outgoing tangents point in the same direction.
    for (const i of [3,6,9,12]) {
      const incoming = [points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]];
      const outgoing = [points[i+1][0]-points[i][0],points[i+1][1]-points[i][1]];
      const cross = incoming[0]*outgoing[1]-incoming[1]*outgoing[0];
      assert.ok(Math.abs(cross)<1e-9, `shoulder join ${i} must have no kink`);
      assert.ok(incoming[0]*outgoing[0]+incoming[1]*outgoing[1]>0);
    }
  };
  shoulder(900); s.resize(); s.flush(); shoulder(1100);
  s.w.happyDOM.abort();
});

test('One opaque mobile sheet spans the shoulder and info, keeping the same pixel boundary and dot grid after resize', () => {
  const s=setup({mobile:true});
  for(const height of [900,1100]) {
    if(height===1100){s.resize();s.flush();}
    const d=s.w.document;
    const paper=d.querySelector('#pickup-paper-mobile-shape').getAttribute('d');
    const boundary=d.querySelector('#pickup-curve-mobile path').getAttribute('d');
    const points = path => path.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi).map(Number).slice(2,-2);
    const foreground = points(paper), edge = points(boundary);
    assert.equal(foreground.length,edge.length);
    foreground.forEach((n,i) => assert.ok(Math.abs(i%2 ? n*(height+300)-edge[i]*height : n-edge[i])<.001));
    assert.ok(paper.endsWith(' L1 1 Z'), 'the sheet must continue through the bottom of the info panel');
    assert.ok(d.querySelector('.pickup-paper-cover').hasAttribute('data-mobile-ready'));
    assert.ok(Math.abs(Number(d.querySelector('#pickup-paper-dots').getAttribute('width'))*1251-9)<.001);
    assert.ok(Math.abs(Number(d.querySelector('#pickup-paper-dots').getAttribute('height'))*(height+300)-9)<.001);
  }
  s.w.happyDOM.abort();
});

test('Restored scroll, hash navigation, and resizing recompute header state in one animation frame', () => {
  const s = setup({ scroll: 1200 });
  assert.equal(s.header.dataset.headerState, 'compact');
  s.move(0, 'pageshow'); s.flush();
  assert.equal(s.header.dataset.headerState, 'video');
  const middle = s.crossing() + 55;
  s.move(middle, 'hashchange'); s.flush();
  assert.equal(s.header.dataset.headerState, 'color');
  s.resize(); s.move(middle); s.move(middle);
  assert.equal(s.frames.length, 1);
  s.flush();
  assert.equal(s.header.dataset.headerState, 'video');
  s.w.happyDOM.abort();
});

test('Inner pages start in the original color and compact after 160px, including restored positions', () => {
  const s = setup({ home: false, scroll: 80 });
  assert.equal(s.value('--logo-white'), 0);
  assert.equal(s.value('--header-progress'), .5);
  s.move(160); s.flush();
  assert.equal(s.header.dataset.headerState, 'compact');
  s.move(0); s.flush();
  assert.equal(s.value('--header-background'), 1);
  s.w.happyDOM.abort();
});

test('Reduced motion switches header states directly instead of partial transitions', () => {
  const s = setup({ reduced: true });
  s.move(s.crossing() + 5); s.flush();
  assert.equal(s.value('--logo-white'), 0);
  assert.equal(s.value('--header-progress'), 0);
  s.move(s.crossing() + 185); s.flush();
  assert.equal(s.value('--header-progress'), 1);
  s.w.happyDOM.abort();
});
