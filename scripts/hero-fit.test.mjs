import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { Window } from 'happy-dom';

const code = ts.transpileModule(fs.readFileSync('src/scripts/site.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

// Layout measurements stand in for browser typesetting. Heights deliberately
// differ between decorated copy and the compact layouts; all use original text.
function setup({ mobile = false, longTitle = false } = {}) {
  const w = new Window({ settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  w.document.write(fs.readFileSync('dist/index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
  const d = w.document, info = d.querySelector('.pickup-info'), copy = d.querySelector('.pickup-copy-layout');
  const section = d.querySelector('#pickup'), video = d.querySelector('.pickup-video'), title = info.querySelector('h1');
  let budget = 320;
  const frames = [];
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  w.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  info.style.padding = '0';
  video.style.setProperty('--video-profile', mobile ? 'mobile' : 'desktop');
  section.getBoundingClientRect = () => rect(0, 0, 1251, 900);
  video.getBoundingClientRect = () => rect(0, 0, 1251, 900);
  info.getBoundingClientRect = () => rect(630, 500, 570, budget);
  Object.defineProperty(info, 'clientHeight', { get: () => budget });
  Object.defineProperty(info, 'clientWidth', { get: () => 570 });
  Object.defineProperty(title, 'clientHeight', { get: () => 60 });
  Object.defineProperty(title, 'scrollHeight', { get: () => longTitle ? 300 : 60 });
  copy.getBoundingClientRect = () => rect(630, 500, 570, ({ full: 450, tight: 260, minimal: 85 })[info.dataset.copyMode]);
  w.eval(code);
  return {
    w, info, section,
    resize(height) { budget = height; w.dispatchEvent(new w.Event('resize')); const pending = frames.splice(0); pending.forEach(callback => callback(0)); },
  };
}

test('Hero compacts decoration before the reading controls and restores the full layout when space returns', () => {
  const s = setup();
  assert.equal(s.info.dataset.copyMode, 'tight');
  s.resize(180); assert.equal(s.info.dataset.copyMode, 'minimal');
  s.resize(100); assert.equal(s.info.dataset.copyMode, 'minimal');
  s.resize(500); assert.equal(s.info.dataset.copyMode, 'full');
  assert.ok(Math.abs(parseFloat(s.section.style.getPropertyValue('--pickup-bottom-gap')) - 31.5) < .001);
  s.w.happyDOM.abort();
});

test('Clamped titles retain the introduction entry even when there is room for the full description', () => {
  const s = setup({ longTitle: true });
  s.resize(500);
  assert.equal(s.info.dataset.copyMode, 'full');
  assert.ok(s.info.querySelector('.pickup-expand[data-introduction-open]'));
  assert.ok(s.info.querySelector('.pickup-read-more[data-introduction-open]'));
  s.w.happyDOM.abort();
});

test('Mobile retains original copy and Read more without expanding the frame', () => {
  const s = setup({ mobile: true });
  s.resize(500); assert.equal(s.info.dataset.copyMode, 'full');
  assert.equal(s.info.querySelector('.pickup-summary'), null);
  s.resize(100); assert.equal(s.info.dataset.copyMode, 'minimal');
  assert.equal(s.section.style.getPropertyValue('--pickup-bottom-gap'), '');
  s.w.happyDOM.abort();
});
