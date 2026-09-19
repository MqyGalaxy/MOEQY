import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parse, parseDocument, stringify } from 'yaml';
import { marked } from 'marked';
import { applyRelationOperations, assertUniqueLanguages, relationGroups, postLanguage } from '../tools/content-studio/article-relations.mjs';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const localePattern = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function required(value, name) { if (typeof value !== 'string' || !value.trim()) fail(`请填写${name}`); return value.trim(); }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
export function splitPost(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) fail('文章缺少有效的 YAML frontmatter');
  const doc = parseDocument(match[1]);
  if (doc.errors.length) fail('文章 YAML 格式错误');
  return { doc, meta: doc.toJS(), body: match[2] };
}
export function flatten(value, trail = [], out = []) {
  if (typeof value === 'string') out.push({ path: trail, value });
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) flatten(child, [...trail, Array.isArray(value) ? Number(key) : key], out);
  return out;
}
export function createStore(root) {
  root = fs.realpathSync(root);
  function safe(relative) {
    if (typeof relative !== 'string' || relative.includes('\\') || relative.includes('\0') || relative.split('/').some(p => p === '..' || p === '.')) fail('非法路径');
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(root + path.sep)) fail('路径超出项目');
    let parent = root;
    for (const part of path.relative(root, absolute).split(path.sep)) {
      parent = path.join(parent, part);
      if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) fail('不支持符号链接路径');
    }
    return absolute;
  }
  const read = relative => fs.existsSync(safe(relative)) ? fs.readFileSync(safe(relative), 'utf8') : '';
  function walk(relative) {
    if (!fs.existsSync(safe(relative))) return [];
    return fs.readdirSync(safe(relative), { withFileTypes: true }).flatMap(entry => {
      if (entry.isSymbolicLink()) return [];
      const name = `${relative}/${entry.name}`;
      return entry.isDirectory() ? walk(name) : [name];
    });
  }
  function locales() { return JSON.parse(read('src/data/locales.json')); }
  function sourceFiles() { return [...new Set(['src/data/works.json', 'src/data/locales.json', 'src/data/legacy-post-body-hashes.json', ...locales().map(l=>l.dictionary), ...walk('src/content/posts'), ...walk('src/content/works')])].sort(); }
  function revision() { const hash = createHash('sha256'); for (const name of sourceFiles()) hash.update(name).update('\0').update(read(name)).update('\0'); return hash.digest('hex'); }
  function snapshot() {
    const languages = locales();
    const posts = walk('src/content/posts').filter(f=>f.endsWith('.md')).map(file => {
      const { meta, body } = splitPost(read(file));
      return { slug: file.slice('src/content/posts/'.length,-3), meta, body };
    });
    const works = JSON.parse(read('src/data/works.json')).map(work => ({ ...work, bodies:Object.fromEntries(languages.map(l=>[l.code,read(`src/content/works/${work.id}/${l.code}.md`)])) }));
    return { revision:revision(), locales:languages, posts, works, articleGroups:relationGroups(posts).map(group=>({id:group.id,key:group.key,slugs:group.posts.map(p=>p.slug)})),
      dictionaries:Object.fromEntries(languages.map(l=>[l.code,flatten(parse(read(l.dictionary)) || {})])),
      assets:walk('public').filter(f=>/\.(png|jpe?g|webp|gif|svg)$/i.test(f)).map(f=>f.slice(6)) };
  }
  function relationChanges(before,after){
    const changes={};
    for(const post of after){
      const original=before.find(p=>p.slug===post.slug);
      if(original?.meta.translationKey===post.meta.translationKey)continue;
      const file=`src/content/posts/${post.slug}.md`;
      const raw=read(file),{doc,body}=splitPost(raw),eol=raw.includes('\r\n')?'\r\n':'\n';
      doc.set('translationKey',post.meta.translationKey);
      changes[file]=`---${eol}${doc.toString().trimEnd().replace(/\r?\n/g,eol)}${eol}---${eol}${body}`;
    }
    return changes;
  }
  function saveRelations(input){
    const before=snapshot().posts;
    const after=applyRelationOperations(before,input.operations);
    return commit(relationChanges(before,after),input.revision);
  }
  function migrateLegacyRelations(){
    const before=snapshot(),posts=before.posts,operations=[];
    const pairs=[['chanpin/20240210/post-1','products/20240210/post-1'],...['20230808','20231110','20250708'].map(date=>[`gonggao/${date}/post-1`,`news/${date}/post-1`])];
    for(const [left,right] of pairs){
      const a=posts.find(p=>p.slug===left),b=posts.find(p=>p.slug===right);
      if(!a || !b)throw new Error(`历史译文缺失：${left} / ${right}`);
      if(a.meta.translationKey && a.meta.translationKey===b.meta.translationKey)continue;
      if(Object.hasOwn(a.meta,'translationKey') || Object.hasOwn(b.meta,'translationKey'))throw new Error(`历史译文已有关系设置，未覆盖：${left} / ${right}`);
      operations.push({type:'bind',source:left,target:right});
    }
    const hashes=JSON.parse(read('src/data/legacy-post-hashes.json') || '{}');
    const bodyHashes=JSON.parse(read('src/data/legacy-post-body-hashes.json') || '{}');
    for(const [slug,hash] of Object.entries(hashes)){
      const raw=read(`src/content/posts/${slug}.md`);
      if(createHash('sha256').update(raw).digest('hex')===hash){
        const bodyHash=createHash('sha256').update(splitPost(raw).body.replaceAll('\r\n','\n')).digest('hex');
        if(bodyHashes[slug] && bodyHashes[slug]!==bodyHash)throw new Error(`历史正文指纹冲突：${slug}`);
        bodyHashes[slug]=bodyHash;
      }
    }
    const changes=relationChanges(posts,applyRelationOperations(posts,operations));
    changes['src/data/legacy-post-body-hashes.json']=JSON.stringify(bodyHashes,null,2)+'\n';
    return {...commit(changes,before.revision),migratedPairs:operations.length};
  }
  function commit(changes, expected) {
    if (expected !== revision()) fail('源文件已被其他窗口或工具修改。请重新载入后再保存，当前输入仍保留。',409);
    const entries = Object.entries(changes).filter(([file,text])=>read(file)!==text);
    if (!entries.length) return { revision:revision(), backup:null };
    const transaction = `${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`;
    const backup = `.content-studio/backups/${transaction}`;
    const originals = new Map();
    const staged = [];
    try {
      for (const [file,text] of entries) {
        const target = safe(file);
        const original = fs.existsSync(target) ? fs.readFileSync(target) : null;
        originals.set(file,original);
        if (original) { const dest=safe(`${backup}/${file}`); fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,original); }
        fs.mkdirSync(path.dirname(target),{recursive:true});
        const temporary = `${target}.${transaction}.tmp`;
        fs.writeFileSync(temporary,text,'utf8'); staged.push([temporary,target]);
      }
      fs.mkdirSync(safe(backup),{recursive:true});
      fs.writeFileSync(safe(`${backup}/manifest.json`),JSON.stringify({createdAt:new Date().toISOString(),files:entries.map(([file])=>({file,existed:originals.get(file)!==null}))},null,2));
      for (const [temporary,target] of staged) fs.renameSync(temporary,target);
    } catch (error) {
      for (const [file,original] of originals) { if (original!==null) fs.writeFileSync(safe(file),original); else if(fs.existsSync(safe(file))) fs.unlinkSync(safe(file)); }
      throw error;
    } finally { for (const [temporary] of staged) if(fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return {revision:revision(),backup};
  }
  function asset(value, optional=false) {
    if (!value && optional) return '';
    required(value,'图片路径');
    if (!value.startsWith('/') || value.startsWith('//') || /[?#]/.test(value)) fail('图片请使用站内素材路径');
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(value) || !fs.existsSync(safe(`public${value}`))) fail(`图片不存在：${value}`);
    return value;
  }
  function href(value) {
    required(value,'访问地址');
    if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !value.includes('..')) return value;
    try { if (['https:','http:'].includes(new URL(value).protocol)) return value; } catch {}
    fail('访问地址必须为站内路径或 HTTP(S) 地址');
  }
  function savePost(input) {
    const {slug,meta,body,isNew,revision:expected} = input;
    const validSlug=isNew?slugPattern.test(slug):(idPattern.test(slug) || slugPattern.test(slug));
    if (!validSlug || /^(en|ja|zh-cn|works|about|faq|archives|pages|tags|categories|page|privacy|help|feedback|conceptsgame)\//i.test(slug)) fail('文章路径需为安全的小写目录／名称，且不能占用系统路由');
    const file=`src/content/posts/${slug}.md`, existing=read(file);
    if (isNew && existing) fail('该文章路径已存在',409);
    if (!isNew && !existing) fail('文章已不存在，请重新载入',409);
    if (!plain(meta)) fail('文章信息格式错误');
    required(meta.title,'标题'); required(body,'文章正文');
    const date=required(meta.date,'日期');
    const dateMatch=date.match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/);
    if (!dateMatch || !Number.isFinite(Date.parse(date.replaceAll('/','-')))) fail('日期格式应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss');
    if (new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00Z`).toISOString().slice(0,10)!==`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`) fail('日期不存在');
    for (const key of ['categories','tag','tags']) if (Object.hasOwn(meta,key) && (!Array.isArray(meta[key]) || meta[key].some(v=>!['string','number'].includes(typeof v)))) fail(`${key} 必须为文字列表`);
    const lang=meta.lang || meta.language;
    const locale=locales().find(l=>l.code===lang);
    if (!locale) fail('请选择已登记的语言');
    if (locale.status!=='live' && meta.draft!==true) fail('准备中的语言只能保存为草稿');
    if (meta.cover) asset(meta.cover);
    if (meta.translationKey && !idPattern.test(meta.translationKey)) fail('翻译组 ID 仅使用小写字母、数字和连字符');
    const before=snapshot().posts,changes={};
    const original=before.find(p=>p.slug===slug);
    if(original && original.meta.translationKey!==meta.translationKey)fail('请通过文章关系页面修改绑定');
    if(isNew && input.translationSource){
      const source=before.find(p=>p.slug===input.translationSource);
      if(!source)fail('原文已不存在，请重新载入',409);
      const after=applyRelationOperations([...before,{slug,meta,body}],[{type:'bind',source:source.slug,target:slug}]);
      Object.assign(changes,relationChanges(before,after.filter(p=>p.slug!==slug)));
      meta.translationKey=after.find(p=>p.slug===slug).meta.translationKey;
    } else if(isNew && meta.translationKey)fail('新译文需要选择原文');
    assertUniqueLanguages([...before.filter(p=>p.slug!==slug),{slug,meta,body}]);
    const doc = existing ? splitPost(existing).doc : parseDocument('{}');
    for (const key of ['title','date','lang','language','categories','tag','tags','cover','translationKey','draft']) {
      if (Object.hasOwn(meta,key)) doc.set(key,meta[key]);
      else if (['lang','language','cover','translationKey'].includes(key)) doc.delete(key);
    }
    return commit({...changes,[file]:`---\n${doc.toString().trimEnd()}\n---\n${body}`},expected);
  }
  function saveWork(input) {
    const {work,bodies,isNew,revision:expected}=input;
    if (!plain(work) || !idPattern.test(work.id)) fail('作品 ID 仅使用小写字母、数字和连字符');
    const list=JSON.parse(read('src/data/works.json')), index=list.findIndex(w=>w.id===work.id);
    if (isNew && index!==-1) fail('作品 ID 已存在',409);
    if (!isNew && index===-1) fail('作品已不存在，请重新载入',409);
    href(work.href); asset(work.cover); asset(work.logo,true);
    if (!plain(work.text) || !plain(bodies)) fail('作品翻译格式错误');
    const languages=locales();
    const changes={};
    for(const locale of languages) {
      const text=work.text[locale.code], body=bodies[locale.code] || '';
      if (work.enabled && locale.status==='live') {
        for(const key of ['title','category','description','cta']) required(text?.[key],`${locale.label} ${key}`);
        required(body,`${locale.label}正文`);
      }
      if (body && /<h1\b/i.test(marked.parse(body))) fail(`${locale.label}正文请从二级标题开始`);
      if (Object.hasOwn(bodies,locale.code)) changes[`src/content/works/${work.id}/${locale.code}.md`]=body;
    }
    const saved={...(list[index] || {}),id:work.id,enabled:!!work.enabled,homeFeatured:!!work.homeFeatured,pageFeatured:!!work.pageFeatured,href:work.href,cover:work.cover,logo:work.logo || '',text:work.text};
    if(index===-1)list.push(saved);else list[index]=saved;
    changes['src/data/works.json']=JSON.stringify(list,null,2)+'\n';
    return commit(changes,expected);
  }
  function saveDictionary(input) {
    const locale=locales().find(l=>l.code===input.locale);
    if(!locale || !Array.isArray(input.entries)) fail('语言或文案格式错误');
    const doc=parseDocument(read(locale.dictionary) || '{}');
    for(const entry of input.entries) {
      if(!Array.isArray(entry.path) || !entry.path.length || entry.path.some(k=>forbidden.has(k) || !['string','number'].includes(typeof k)) || typeof entry.value!=='string') fail('翻译键格式错误');
      doc.setIn(entry.path,entry.value);
    }
    return commit({[locale.dictionary]:doc.toString()},input.revision);
  }
  function addLocale(input) {
    const code=required(input.code,'语言代码'),label=required(input.label,'语言名称');
    if(!localePattern.test(code)) fail('使用语言代码，例如 ja、ko、fr');
    const list=locales();
    if(list.some(l=>l.code.toLowerCase()===code.toLowerCase())) fail('语言已存在');
    const dictionary=`src/data/locales/${code}.yml`;
    list.push({code,label,status:'draft',dictionary});
    return commit({'src/data/locales.json':JSON.stringify(list,null,2)+'\n',[dictionary]:stringify({})},input.revision);
  }
  function upload({name,data}) {
    if (typeof data!=='string' || data.length>15_000_000) fail('图片不能超过 10 MB');
    const bytes=Buffer.from(data,'base64');
    const ext=path.extname(name||'').toLowerCase();
    const valid=(['.jpg','.jpeg'].includes(ext)&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||
      (ext==='.png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
      (ext==='.gif'&&/^GIF8[79]a$/.test(bytes.subarray(0,6).toString()))||
      (ext==='.webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP');
    if(!valid || bytes.length>10_000_000) fail('请选择有效的 PNG、JPEG、GIF 或 WebP 图片（最多 10 MB）');
    const file=`public/images/uploads/${randomUUID()}${ext}`;
    fs.mkdirSync(path.dirname(safe(file)),{recursive:true});fs.writeFileSync(safe(file),bytes,{flag:'wx'});
    return {path:file.slice(6)};
  }
  return {snapshot,savePost,saveWork,saveDictionary,addLocale,upload,saveRelations,migrateLegacyRelations,safe};
}
