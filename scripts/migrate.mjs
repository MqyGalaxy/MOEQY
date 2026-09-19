// One-time migration from the read-only Hexo source. Run explicitly when re-importing.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
const oldRoot = process.argv[2] || 'D:/WEBsite/Blog3.0/home3.0/MOEQY';
const out = path.resolve('src/data');
const documents = {};
for (const lang of ['zh-CN', 'en']) {
  for (const slug of ['about', 'privacy', 'help/translate']) {
    const file = path.join(oldRoot, 'public', lang === 'en' ? 'en' : '', slug, 'index.html');
    const $ = load(fs.readFileSync(file, 'utf8'));
    const content = $('.page-body .layout').first();
    content.find('script, h1').remove();
    content.find('[style]').each((_, el) => {
      const style = $(el).attr('style') || '';
      $(el).removeAttr('style');
      if (style.includes('background: #000')) $(el).attr('style', 'background: #000');
    });
    content.find('[class]').each((_, el) => $(el).attr('class', ($(el).attr('class') || '').replace(/\b(wow|animate__\S+)\b/g, '').trim()));
    content.find('a[href]').each((_, el) => {
      const a = $(el); const href = a.attr('href');
      if (/^https?:\/\/(www\.)?moeqy\.com\//.test(href)) a.attr('href', new URL(href).pathname);
      if (a.attr('target') === '_blank') a.attr('rel', 'noopener noreferrer');
    });
    content.find('img').attr('loading','lazy');
    documents[`${lang}/${slug}`] = content.html();
  }
}
fs.writeFileSync(path.join(out, 'documents.json'), JSON.stringify(documents, null, 2));
const $ = load(fs.readFileSync(path.join(oldRoot,'themes/MoeQY/layout/faq.ejs'),'utf8'));
const faq = [];
for (let i=0; i<5; i++) {
  const section = $(`#div${i}`);
  faq.push({ title: section.find('.faqHead').text(), questions: section.find('.accordion').toArray().map(button => ({ question: $(button).text(), answer: $(button).next('.panel').html()?.trim() })) });
}
fs.writeFileSync(path.join(out,'faq.json'),JSON.stringify(faq,null,2));
// Preserve Hexo-rendered extensions and heading anchors until the Markdown is edited.
const postHtml = {};
const postHashes = {};
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const sourceRoot=path.join(oldRoot,'source/_posts');
for (const file of walk(sourceRoot).filter(f=>f.endsWith('.md'))) {
  const slug=path.relative(sourceRoot,file).replaceAll('\\','/').replace(/\.md$/,'');
  const p = load(fs.readFileSync(path.join(oldRoot,'public',slug,'index.html'),'utf8'));
  postHtml[slug] = p('.post-content').html();
  postHashes[slug] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
fs.writeFileSync(path.join(out,'legacy-post-html.json'),JSON.stringify(postHtml,null,2));
fs.writeFileSync(path.join(out,'legacy-post-hashes.json'),JSON.stringify(postHashes,null,2));
console.log(`Migrated ${Object.keys(documents).length} documents and ${faq.reduce((n,s)=>n+s.questions.length,0)} FAQ answers.`);
