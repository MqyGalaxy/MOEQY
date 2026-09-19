import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('dist');
for (const lang of ['en','ja']) {
const generated = path.join(root, `${lang}/404.html/index.html`);
const output = path.join(root, `${lang}/404.html`);
// Astro's directory output nests non-root HTML routes. Preserve the legacy file URL.
if (fs.existsSync(generated)) {
  const html = fs.readFileSync(generated, 'utf8');
  fs.unlinkSync(generated);
  fs.rmdirSync(output); // This exact build directory is now empty; never recursive.
  fs.writeFileSync(output, html);
}
}
fs.writeFileSync(path.join(root, '.nojekyll'), '');
