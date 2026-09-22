import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { load } from 'cheerio';
import { marked } from 'marked';
import { Window } from 'happy-dom';

const read = file => fs.readFileSync(file, 'utf8');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const languages = [['', '发送邮件'], ['en/', 'Send an email'], ['ja/', 'メールを送る']];
const address = 'mail@moeqy.com';
const compile = (file, dependencies = {}) => {
  const exports = {};
  const code = ts.transpileModule(read(file), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, Buffer, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports;
};
const config = compile('src/lib/contact.ts');
const htmlHelpers = compile('src/lib/contact-html.ts', { cheerio: { load }, './contact': config });

test('Published pages, scripts and public data contain no exposed site email', () => {
  for (const file of walk('dist').filter(file => /\.(?:html|js|mjs|json|xml|txt|map|css|svg)$/i.test(file))) {
    const text = read(file);
    assert.doesNotMatch(text, /mail(?:@|#|%40|&#0*64;|&#x0*40;|&commat;)moeqy\.com/i, file);
    if (!file.endsWith('.html')) continue;
    const $ = load(text);
    assert.doesNotMatch($.text(), /mail[@#]moeqy\.com/i, file);
    assert.equal($('a[href^="mailto:"]').length, 0, file);
    if (file.includes(path.join('img', 'icon'))) continue; // Bundled icon catalogue has no site layout.
    const lang = $('html').attr('lang');
    const prefix = lang === 'zh-CN' ? '' : `${lang}/`;
    assert.equal($('.footer-contact').text().trim(), 'Contact Us', file);
    assert.equal($('.footer-contact').attr('href'), `/${prefix}about/#contact-us`, file);
    assert.equal($('.footer-contact').attr('target'), undefined, file);
    $('a[data-email]').each((_, el) => {
      assert.equal(Buffer.from($(el).attr('data-email'), 'base64').toString(), address, file);
      assert.equal($(el).attr('href'), `/${prefix}about/#contact-us`, file);
      assert.ok($(el).attr('aria-label'), file);
      assert.equal($(el).attr('target'), undefined, file);
    });
  }
});

test('All six contact modules have one anchor, four intact channels and a no-script fallback', () => {
  for (const [prefix, label] of languages) for (const route of ['about', 'help/translate']) {
    const $ = load(read(`dist/${prefix}${route}/index.html`));
    assert.equal($('#contact-us').length, 1);
    assert.equal($('#contact-heading').length, 1);
    assert.equal($('.about-contact').length, 0);
    assert.equal($('.contact-links a').length, 4);
    assert.deepEqual($('.contact-links a:not([data-email])').map((_, el) => $(el).attr('href')).get(), [
      'https://github.com/MqyGalaxy', 'https://space.bilibili.com/147114872', 'https://music.163.com/#/user/home?id=431446496',
    ]);
    assert.equal($('.contact-links [data-email]').text(), `Email${label}`);
    assert.ok($('.contact-section noscript').html().includes('GitHub'));
    assert.equal($('.contact-decoration').attr('aria-hidden'), 'true');
  }
  // Preserve Japanese copy after the original contact block, and all other prose.
  for (const route of ['about', 'help-translate', 'privacy']) {
    const $ = load(read(`dist/ja/${route.replace('help-translate', 'help/translate')}/index.html`));
    const expected = load(marked.parse(read(`src/content/documents/ja/${route}.md`)));
    expected('.about-contact').parent().remove();
    $('.contact-section').remove();
    const clean = text => text.replace(/\s+/g, '');
    assert.equal(clean($('article.prose').text()), clean(expected.text().replaceAll(address, 'メールを送る')));
  }
});

test('Render-time protection preserves structure, literal markup, unrelated links and source order', () => {
  const input = '<p>A &lt;b&gt; &amp; mail#moeqy.com <code>mail@moeqy.com</code> (please replace # with @)</p><a href="mailto:mail@moeqy.com">Email</a><a href="https://example.com">keep me</a>';
  const output = htmlHelpers.protectContactHtml(input, 'en');
  const $ = load(output);
  assert.equal($('[data-email]').length, 3);
  assert.equal($('a a').length, 0);
  assert.equal($('b').length, 0);
  assert.equal($('p').text(), 'A <b> & Send an email Send an email');
  assert.equal($('code [data-email]').length, 1);
  assert.equal($('a[href="https://example.com"]').text(), 'keep me');
  assert.equal(htmlHelpers.protectContactHtml(output, 'en'), output);
  const parts = htmlHelpers.documentContactParts('<p>before</p><div class="layout-1"><div>title</div><p class="about-contact">old</p></div><p>after</p>');
  assert.deepEqual(Array.from(parts), ['<p>before</p>', '<p>after</p>']);
});

const siteCode = ts.transpileModule(read('src/scripts/site.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function setup(prefix) {
  const w = new Window({ url: `https://www.moeqy.com/${prefix}about/`, settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableIframePageLoading: true } });
  w.document.write(read(`dist/${prefix}about/index.html`).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
  const navigations = [];
  w.location.assign = url => navigations.push(url);
  w.eval(siteCode);
  return { w, navigations };
}

test('Nested icon clicks and repeated activations open mail without exposing the address in the DOM', () => {
  for (const [prefix] of languages) {
    const { w, navigations } = setup(prefix);
    for (const selector of ['.side-nav', '#site-menu', '.site-footer', '.contact-section']) {
      const anchor = w.document.querySelector(`${selector} a[data-email]`);
      for (let i = 0; i < 2; i++) {
        const event = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: i });
        anchor.querySelector('use').dispatchEvent(event);
        assert.equal(event.defaultPrevented, true);
        assert.equal(navigations.at(-1), `mailto:${address}`);
      }
      assert.equal(anchor.getAttribute('href'), `/${prefix}about/#contact-us`);
      assert.equal(anchor.tabIndex, 0); // Native anchors support keyboard activation.
    }
    assert.equal(navigations.length, 8);
    assert.doesNotMatch(w.document.documentElement.outerHTML, /mail[@#]moeqy\.com/);
    w.happyDOM.abort();
  }
});

test('Bad encodings, unsafe destinations and unavailable mail handlers retain the native fallback', () => {
  const { w, navigations } = setup('ja/');
  const anchor = w.document.querySelector('.contact-section [data-email]');
  for (const value of ['?', '', Buffer.from('javascript:alert(1)').toString('base64'), Buffer.from('a@b.com?bcc=other@example.com').toString('base64')]) {
    anchor.dataset.email = value;
    const event = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(navigations.length, 0);
  anchor.dataset.email = config.encodedEmail;
  w.location.assign = () => { throw new Error('No handler'); };
  const event = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  anchor.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(anchor.getAttribute('href'), '/ja/about/#contact-us');
  w.happyDOM.abort();
});
