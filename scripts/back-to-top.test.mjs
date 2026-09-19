import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { Window } from 'happy-dom';

const code = ts.transpileModule(fs.readFileSync('src/scripts/site.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

for (const home of [false, true]) for (const mobile of [false, true]) {
  test(`Back-to-top docks and releases at ${home ? 'blog banner' : 'footer'} (${mobile ? 'mobile' : 'desktop'})`, () => {
    const w = new Window();
    const frames = [];
    let scroll = 0, height = 800, boundary = 2000;
    const size = mobile ? 56 : 68, gap = mobile ? 18 : 26;
    w.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    Object.defineProperty(w, 'scrollY', { get: () => scroll });
    Object.defineProperty(w, 'innerHeight', { get: () => height });
    w.document.body.classList.toggle('is-home', home);
    w.document.body.innerHTML = `<section class="blog-banner"></section><footer class="site-footer"></footer><a class="back-to-top" href="#top" style="--back-top-gap:${gap}px"></a>`;
    const button = w.document.querySelector('.back-to-top');
    Object.defineProperty(button, 'offsetHeight', { get: () => size });
    w.document.querySelector('.blog-banner').getBoundingClientRect = () => ({ top: boundary - scroll });
    w.document.querySelector('.site-footer').getBoundingClientRect = () => ({ top: boundary + (home ? 900 : 0) - scroll });
    w.eval(code);
    const update = (nextScroll, event = 'scroll') => {
      scroll = nextScroll;
      w.dispatchEvent(new w.Event(event));
      frames.splice(0).forEach(callback => callback(0));
    };
    const center = () => height - gap - size / 2 - parseFloat(button.style.getPropertyValue('--back-top-lift'));
    try {
      assert.equal(button.classList.contains('visible'), false);
      update(600);
      assert.equal(button.classList.contains('visible'), true);
      assert.equal(button.classList.contains('is-docked'), false);
      update(1400);
      assert.equal(button.classList.contains('is-docked'), true);
      assert.equal(center(), boundary - scroll, 'exactly half of the circle lies above the boundary');
      update(1500);
      assert.equal(center(), boundary - scroll, 'the button travels with its section');
      height = 900;
      update(1500, 'resize');
      assert.equal(center(), boundary - scroll, 'viewport changes keep the center anchored');
      boundary += 500;
      update(1500, 'load');
      assert.equal(button.classList.contains('is-docked'), false, 'late content moves the boundary');
      update(600);
      assert.equal(button.style.getPropertyValue('--back-top-lift'), '0px');
      update(0, 'hashchange');
      assert.equal(button.classList.contains('visible'), false);
      assert.equal(button.getAttribute('href'), '#top');
    } finally { w.happyDOM.abort(); }
  });
}
