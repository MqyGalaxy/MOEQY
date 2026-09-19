// Extract SVG artwork without executing the iconfont browser-injection script.
// Run after replacing the local iconfont export: node scripts/sync-icons.mjs
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../public/img/icon/', import.meta.url);
const source = await readFile(new URL('iconfont.js', root), 'utf8');
const symbols = [...source.matchAll(/<symbol\b[^>]*>[\s\S]*?<\/symbol>/g)].map(([svg]) =>
  svg.replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"'));
if (!symbols.length) throw new Error('No SVG symbols found in the local icon library');
await writeFile(new URL('library.svg', root), `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`);
console.log(`Exported ${symbols.length} local SVG icons.`);
