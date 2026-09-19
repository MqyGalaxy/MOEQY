import { postLanguage, postDate, postStatus, comparePosts, relationGroups } from './article-relations.mjs';
import { mountRelationCanvas } from './relation-canvas.js';
const $=selector=>document.querySelector(selector);
const escapeHtml=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,section='posts',selected=null,draft=null,isNew=false,dirty=false,busy=false,workLocale='zh-CN',assetTarget,postLocale=null,relationView=null,translationSource=null;
const studioStatus=(text,error=false)=>{$('#status').textContent=text;$('#status').classList.toggle('error',error);};
const copy=value=>structuredClone(value);
async function api(endpoint,data) {
  const response=await fetch(`/api/${endpoint}`,data ? {method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':state.token},body:JSON.stringify(data)} : {});
  const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
}
function markDirty(){dirty=true;const note=$('[data-save-note]');if(note)note.textContent='有未保存的修改';}
async function mayLeave(){
  if(busy)return false;
  if(!dirty)return true;
  const dialog=$('#confirm-dialog');dialog.returnValue='cancel';dialog.showModal();
  return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='discard'),{once:true}));
}
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();}});
async function load(){
  state=await api('state');$('#post-count').textContent=state.posts.length;$('#work-count').textContent=state.works.length;
  studioStatus('已连接本地源文件 · 保存时自动备份 · 不会自动发布');renderList();
}
function langName(code){return state.locales.find(l=>l.code===code)?.label || code;}
function setSection(){
  relationView?.destroy();relationView=null;postLocale=null;
  for(const button of document.querySelectorAll('[data-section]')) {if(button.dataset.section===section)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  $('#page-title').textContent={posts:'文章',works:'作品',languages:'语言与翻译',relations:'文章关系'}[section];
  $('#eyebrow').textContent={posts:'STORIES & NOTES',works:'MADE WITH LOVE',languages:'WORDS WITHOUT BORDERS',relations:'CONNECTED STORIES'}[section];
  $('#create').textContent={posts:'新增文章',works:'新增作品',languages:'准备新语言',relations:''}[section];
  selected=null;draft=null;dirty=false;$('#search').value='';
  $('#editor').innerHTML='<div class="welcome"><h2>让创作慢慢生长</h2><p>选择左侧内容开始编辑。所有修改只保存到本地项目。</p></div>';renderList();
}
function renderList(){
  if(!state)return;
  const landing=section==='posts' && !postLocale;
  $('.workspace').hidden=landing;$('.workspace').classList.toggle('is-relations',section==='relations');
  $('#article-language-menu').hidden=!landing;$('#article-language-bar').hidden=section!=='posts' || !postLocale;
  $('#create').hidden=landing || section==='relations';
  if(landing){renderLanguageMenu();return;}
  if(section==='posts')$('#article-language-name').textContent=`${langName(postLocale)} · ${state.posts.filter(p=>postLanguage(p)===postLocale).length} 篇文章 · 最新发布在前`;
  const query=$('#search').value.toLocaleLowerCase();
  const items=section==='posts'?state.posts.filter(p=>postLanguage(p)===postLocale).sort(comparePosts).map(p=>({id:p.slug,title:p.meta.title,sub:`${postDate(p)} · ${p.slug}`,badge:postStatus(p)})):
    section==='relations'?relationGroups(state.posts).map(g=>({id:g.id,title:g.posts.find(p=>postLanguage(p)==='zh-CN')?.meta.title || g.posts[0].meta.title,sub:`${g.key || '未绑定'} · ${g.posts.map(p=>`${p.meta.title} ${p.slug}`).join(' · ')}`,badge:`${g.posts.length} 个语言版本`,active:g.posts.some(p=>p.slug===selected)})):
    section==='works'?state.works.map(w=>({id:w.id,title:w.text['zh-CN']?.title || w.id,sub:w.id,badge:w.enabled?'已启用':'未公开'})):
    state.locales.map(l=>({id:l.code,title:l.label,sub:l.code,badge:l.status==='live'?'已接入网站':'翻译准备中'}));
  $('#items').innerHTML=items.filter(item=>`${item.title} ${item.sub}`.toLowerCase().includes(query)).map(item=>`<button type="button" class="item ${selected===item.id || item.active?'selected':''}" data-id="${escapeHtml(item.id)}"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.sub)}</small><small class="badge">${escapeHtml(item.badge)}</small></button>`).join('') || '<p class="editor-note">没有匹配内容</p>';
  $('#items').querySelectorAll('button').forEach(button=>button.addEventListener('click',async()=>{if(await mayLeave())select(button.dataset.id);}));
}
function select(id){
  relationView?.destroy();relationView=null;
  if(section==='relations'){
    const group=relationGroups(state.posts).find(g=>g.id===id || g.posts.some(p=>p.slug===id));
    selected=group?.posts.find(p=>p.slug===id)?.slug || group?.posts[0]?.slug;
    dirty=false;renderList();
    if(selected)relationView=mountRelationCanvas($('#editor'),{posts:state.posts,locales:state.locales,focusSlug:selected,onDirty:value=>{dirty=value;},onStatus:studioStatus,
      onSave:async operations=>{if(busy)throw new Error('请等待当前保存完成');busy=true;try{const result=await api('article-relations',{operations,revision:state.revision});dirty=false;await load();studioStatus(result.backup?`关系已保存。备份：${result.backup}`:'关系未改变');return state;}finally{busy=false;}},
      onEdit:async slug=>{if(await mayLeave()){section='posts';setSection();select(slug);}},
      onCreate:async (slug,language)=>{if(await mayLeave())openTranslation(slug,language);}
    });
    return;
  }
  selected=id;isNew=false;dirty=false;
  if(section==='posts'){postLocale=postLanguage(state.posts.find(p=>p.slug===id));$('#search').value='';}
  draft=section==='posts'?copy(state.posts.find(p=>p.slug===id)):section==='works'?copy(state.works.find(w=>w.id===id)):{locale:id,entries:copy(state.dictionaries[id] || [])};
  workLocale='zh-CN';renderList();renderEditor();
}
function input(name,label,value='',extra='') {return `<label>${label}<input name="${name}" value="${escapeHtml(value)}" ${extra}></label>`;}
function area(name,label,value='',extra=''){return `<label>${label}<textarea name="${name}" ${extra}>${escapeHtml(value)}</textarea></label>`;}
function checkbox(name,label,checked){return `<label><input name="${name}" type="checkbox" ${checked?'checked':''}>${label}</label>`;}
function assetField(name,label,value){return `<label>${label}<span class="asset-field"><input name="${name}" value="${escapeHtml(value)}" placeholder="/images/…"><button type="button" data-pick="${name}">选择图片</button></span></label>`;}
function saveBar(){return '<div class="save-bar"><span data-save-note>保存到项目源文件 · 自动备份</span><button class="primary" type="submit">保存到本地</button></div>';}
function bodyEditor(value){return `<div class="body-label">${area('body','Markdown 正文',value,'class="markdown" spellcheck="false" required')}</div><div class="toolbar"><button type="button" data-insert="heading">二级标题</button><button type="button" data-insert="bold">粗体</button><button type="button" data-insert="link">链接</button><button type="button" data-insert="image">插入图片</button><button type="button" class="preview-button" id="preview">预览正文</button></div><iframe id="preview-frame" class="preview" title="正文预览" sandbox hidden></iframe>`;}
function renderEditor(){
  if(section==='languages')return renderDictionary();
  const heading=isNew?(section==='posts'?'新文章':'新作品'):(section==='posts'?draft.meta.title:draft.text['zh-CN']?.title || draft.id);
  let fields;
  if(section==='posts'){
    const m=draft.meta,lang=m.lang || m.language || 'zh-CN';
    fields=`<div class="form-grid">${input('slug','文章路径',draft.slug,`${isNew?'':'readonly'} required placeholder="stories/my-first-story"`)}${input('title','标题',m.title,'required')}${input('date','日期',m.date,'required placeholder="YYYY-MM-DD HH:mm:ss"')}<label>内容语言<select name="lang">${state.locales.map(l=>`<option value="${escapeHtml(l.code)}" ${lang===l.code?'selected':''}>${escapeHtml(l.label)}${l.status==='live'?'':'（草稿）'}</option>`).join('')}</select></label>${input('category','分类',m.categories?.[0] || '')}${input('tags','标签（以逗号分隔）',(m.tag || m.tags || []).join(', '))}${assetField('cover','封面（留空使用默认封面）',m.cover || '')}<div class="relation-field"><span>语言版本绑定</span><p>${escapeHtml(m.translationKey || (draft.translationSource?'保存时与原文绑定':'尚未绑定'))}</p>${!isNew?'<button type="button" id="open-relations">查看关系与绑定文章</button>':'<small>先保存文章，再管理绑定关系。</small>'}</div></div><p class="editor-note">同一文章的不同语言可在关系画布中绑定。现有路径保持不变；正文支持 Markdown 和原有 HTML。</p><div class="checks">${checkbox('listed','显示在该语言文章列表',!!m.lang)}${checkbox('draft','草稿（不生成公开页面）',!!m.draft)}</div>${bodyEditor(draft.body)}`;
  }else{
    const w=draft,t=w.text[workLocale] || {};
    fields=`<div class="form-grid">${input('id','作品 ID',w.id,`${isNew?'':'readonly'} required placeholder="my-project"`)}${input('href','访问地址',w.href,'required')}${assetField('cover','封面',w.cover)}${assetField('logo','Logo（可选）',w.logo || '')}</div><div class="checks">${checkbox('enabled','公开展示',w.enabled)}${checkbox('homeFeatured','首页精选',w.homeFeatured)}${checkbox('pageFeatured','作品页推荐',w.pageFeatured)}</div><div class="locale-tabs" aria-label="作品语言">${state.locales.map(l=>`<button type="button" data-work-locale="${escapeHtml(l.code)}" aria-pressed="${workLocale===l.code}">${escapeHtml(l.label)}<small>${w.bodies[l.code]?.trim()?'已有正文':'待补充正文'}</small></button>`).join('')}</div><div class="form-grid">${input('title','作品名称',t.title)}${input('subtitle','副标题（可选）',t.subtitle)}${input('category','分类',t.category)}${input('cta','访问按钮文字',t.cta)}<div class="full">${area('description','作品简介',t.description,'rows="3"')}</div></div><p class="editor-note">公开作品需填齐中英文名称、分类、简介、按钮文字与正文。正文从二级标题开始，其他语言可以逐步准备。</p>${bodyEditor(w.bodies[workLocale] || '')}`;
  }
  $('#editor').innerHTML=`<form id="content-form"><div class="editor-header"><div><h2>${escapeHtml(heading)}</h2><small>${isNew?'新建内容':escapeHtml(selected)}</small></div>${section==='posts'&&!isNew?'<button type="button" id="new-translation">新建译文</button>':''}</div>${fields}${saveBar()}</form>`;
  if(section==='posts')$('[name=lang]').value=postLanguage(draft);
  // Disabled works may save an empty introduction as a draft.
  if(section==='works')$('[name=body]').required=false;
  $('#content-form').addEventListener('input',markDirty);
  $('#content-form').addEventListener('change',markDirty);
  $('#content-form').addEventListener('submit',save);
  document.querySelectorAll('[data-work-locale]').forEach(button=>button.addEventListener('click',()=>{collect();workLocale=button.dataset.workLocale;renderEditor();if(dirty)markDirty();}));
  document.querySelectorAll('[data-pick]').forEach(button=>button.addEventListener('click',()=>openAssets(button.dataset.pick)));
  document.querySelectorAll('[data-insert]').forEach(button=>button.addEventListener('click',()=>{
    const type=button.dataset.insert;if(type==='image')return openAssets('body');
    const body=$('[name=body]'),text=body.value.slice(body.selectionStart,body.selectionEnd);
    insert({heading:`\n## ${text || '标题'}\n`,bold:`**${text || '文字'}**`,link:`[${text || '链接文字'}](https://)`}[type]);
  }));
  $('#preview').addEventListener('click',preview);
  $('#new-translation')?.addEventListener('click',async()=>{if(await mayLeave())openTranslation(selected);});
  $('#open-relations')?.addEventListener('click',async()=>{if(await mayLeave()){const slug=selected;section='relations';setSection();select(slug);}});
}
function collect(){
  if(!draft || section==='languages')return;
  const form=$('#content-form'),value=name=>form.elements.namedItem(name)?.value || '',checked=name=>form.elements.namedItem(name)?.checked || false;
  if(section==='posts'){
    if(isNew)draft.slug=value('slug').trim();
    const m=draft.meta;m.title=value('title');m.date=value('date');m.categories=[value('category')].filter(Boolean);
    m[Object.hasOwn(m,'tags')&&!Object.hasOwn(m,'tag')?'tags':'tag']=value('tags').split(/[,，]/).map(t=>t.trim()).filter(Boolean);
    const lang=value('lang');delete m.lang;delete m.language;m[checked('listed')?'lang':'language']=lang;
    m.draft=checked('draft');m.cover=value('cover').trim();draft.body=value('body');
  }else{
    if(isNew)draft.id=value('id').trim();
    for(const key of ['href','cover','logo'])draft[key]=value(key).trim();
    for(const key of ['enabled','homeFeatured','pageFeatured'])draft[key]=checked(key);
    draft.text[workLocale]={...draft.text[workLocale]};for(const key of ['title','subtitle','category','description','cta'])draft.text[workLocale][key]=value(key);
    draft.bodies[workLocale]=value('body');
  }
}
async function save(event){
  event.preventDefault();if(busy)return;collect();busy=true;
  const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;studioStatus('正在检查并保存…');
  try{
    const key=section==='posts'?draft.slug:section==='works'?draft.id:draft.locale;
    const payload=section==='posts'?{...draft,isNew}:section==='works'?{work:{...draft,bodies:undefined},bodies:draft.bodies,isNew}:draft;
    const result=await api({posts:'post',works:'work',languages:'dictionary'}[section],{...payload,revision:state.revision});
    dirty=false;await load();select(key);studioStatus(result.backup?`已保存。备份：${result.backup}`:'内容没有变化，无需写入。');
  }catch(error){studioStatus(error.message,true);}finally{busy=false;button.disabled=false;}
}
function renderDictionary(){
  const base=state.dictionaries['zh-CN'] || [],byKey=new Map(draft.entries.map(e=>[JSON.stringify(e.path),e]));
  for(const entry of base)if(!byKey.has(JSON.stringify(entry.path))){const added={path:entry.path,value:''};draft.entries.push(added);byKey.set(JSON.stringify(entry.path),added);}
  const translated=draft.entries.filter(e=>e.value.trim()).length;
  $('#editor').innerHTML=`<form id="dictionary-form"><div class="translation-heading"><h2>${escapeHtml(langName(draft.locale))}</h2><span class="translation-progress">${translated} / ${draft.entries.length} 项已填写</span></div><p class="editor-note">此处管理现有站点 YAML 文案。组件内尚未抽出的固定文字不会自动出现在这里。空白项代表待翻译；不会自动机器翻译。</p><label>查找文案键或内容<input id="translation-search" type="search" placeholder="例如 index.about"></label><div id="translation-rows"></div>${saveBar()}</form>`;
  const draw=()=>{
    const q=$('#translation-search').value.toLowerCase();
    $('#translation-rows').innerHTML=draft.entries.map((entry,index)=>({entry,index,source:base.find(e=>JSON.stringify(e.path)===JSON.stringify(entry.path))?.value || ''})).filter(({entry,source})=>`${entry.path.join('.')} ${entry.value} ${source}`.toLowerCase().includes(q)).map(({entry,index,source})=>`<label class="translation-row"><code>${escapeHtml(entry.path.join('.'))}</code>${draft.locale!=='zh-CN'?`<p>${escapeHtml(source)}</p>`:''}<textarea data-entry="${index}" aria-label="${escapeHtml(entry.path.join('.'))}">${escapeHtml(entry.value)}</textarea></label>`).join('');
    $('#translation-rows').querySelectorAll('textarea').forEach(el=>el.addEventListener('input',()=>{draft.entries[Number(el.dataset.entry)].value=el.value;markDirty();}));
  };draw();$('#translation-search').addEventListener('input',draw);$('#dictionary-form').addEventListener('submit',save);
}
function insert(text){const field=$('[name=body]');field.setRangeText(text,field.selectionStart,field.selectionEnd,'end');field.focus();markDirty();}
function openAssets(target){assetTarget=target;$('#asset-search').value='';$('#asset-status').textContent='选择已有图片，或上传 PNG / JPEG / WebP / GIF（最多 10 MB）。';drawAssets();$('#asset-dialog').showModal();}
function drawAssets(){
  const q=$('#asset-search').value.toLowerCase();
  const results=state.assets.filter(asset=>asset.toLowerCase().includes(q));
  $('#asset-grid').innerHTML=results.slice(0,120).map(asset=>`<button type="button" data-asset="${escapeHtml(asset)}"><img src="/asset${escapeHtml(asset)}" alt="" loading="lazy"><small>${escapeHtml(asset)}</small></button>`).join('');
  if(results.length>120)$('#asset-status').textContent=`找到 ${results.length} 张图片，先显示 120 张。输入文件名可以缩小范围。`;
  $('#asset-grid').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>chooseAsset(button.dataset.asset)));
}
function chooseAsset(asset){$('#asset-dialog').close();if(assetTarget==='body')insert(`\n![图片说明](${encodeURI(asset).replaceAll('(','%28').replaceAll(')','%29')})\n`);else {const field=$(`[name="${assetTarget}"]`);field.value=asset;field.focus();markDirty();}}
async function preview(){
  try{
    const {html}=await api('preview',{body:$('[name=body]').value});
    const frame=$('#preview-frame');frame.hidden=false;
    frame.srcdoc=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${location.origin} data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{font:15px/1.9 system-ui;color:#71556f;padding:22px;margin:0;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#d84089;pointer-events:none}pre{white-space:pre-wrap}h1,h2,h3{line-height:1.4}</style></head><body>${html}</body></html>`;
  }catch(error){studioStatus(error.message,true);}
}
document.querySelectorAll('[data-section]').forEach(button=>button.addEventListener('click',async()=>{if(await mayLeave()){section=button.dataset.section;setSection();}}));
$('#search').addEventListener('input',renderList);
$('#reload').addEventListener('click',async()=>{if(await mayLeave()){try{await load();setSection();}catch(error){studioStatus(error.message,true);}}});
$('#create').addEventListener('click',async()=>{
  if(!(await mayLeave()))return;
  if(section==='languages')return $('#locale-dialog').showModal();
  selected=null;isNew=true;workLocale='zh-CN';dirty=false;
  draft=section==='posts'?{slug:'',meta:{title:'',date:new Date().toLocaleDateString('sv-SE'),lang:postLocale || 'zh-CN',categories:[postLocale==='ja'?'お知らせ':postLocale==='en'?'News':'公告'],tag:[],draft:true},body:''}:{id:'',enabled:false,homeFeatured:false,pageFeatured:false,href:'',cover:'',logo:'',text:{},bodies:{}};
  renderList();renderEditor();
});
$('#locale-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('.primary');button.disabled=true;
  try{const code=form.elements.code.value;await api('locale',{code,label:form.elements.label.value,revision:state.revision});dirty=false;$('#locale-dialog').close();await load();select(code);studioStatus('语言草稿已创建。可以先准备站点文案和作品译文；公开路由尚未启用。');form.reset();}catch(error){studioStatus(error.message,true);$('#locale-dialog').close();}finally{button.disabled=false;}
});
$('#locale-cancel').addEventListener('click',()=>$('#locale-dialog').close());
$('#asset-close').addEventListener('click',()=>$('#asset-dialog').close());
$('#asset-search').addEventListener('input',drawAssets);
$('#asset-upload').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  if(file.size>10_000_000){$('#asset-status').textContent='图片不能超过 10 MB';return;}
  try{
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
    const result=await api('upload',{name:file.name,data});state.assets.unshift(result.path);chooseAsset(result.path);studioStatus(`图片已保存到 public${result.path}，请继续保存当前内容以引用它。`);
  }catch(error){$('#asset-status').textContent=error.message;}finally{event.target.value='';}
});

function renderLanguageMenu(){
  const languages=[...state.locales];
  for(const code of new Set(state.posts.map(postLanguage)))if(!languages.some(l=>l.code===code))languages.push({code,label:code,status:'draft'});
  $('#article-language-menu').innerHTML=languages.map(locale=>`<button type="button" class="language-door" data-article-language="${escapeHtml(locale.code)}"><span>${escapeHtml(locale.code)}</span><strong>${escapeHtml(locale.label)}</strong><small>${state.posts.filter(p=>postLanguage(p)===locale.code).length} 篇文章${locale.status==='live'?'':' · 翻译准备中'}</small><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>`).join('');
  $('#article-language-menu').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{postLocale=button.dataset.articleLanguage;renderList();}));
}
$('#back-to-languages').addEventListener('click',async()=>{if(await mayLeave())setSection();});
function openTranslation(slug,language){
  const source=state.posts.find(p=>p.slug===slug);
  const group=relationGroups(state.posts).find(g=>g.posts.some(p=>p.slug===slug));
  const used=new Set(group.posts.map(postLanguage));
  const available=state.locales.filter(l=>!used.has(l.code));
  if(!available.length)return studioStatus('所有已登记语言都有版本，可在语言面板准备新语言。');
  translationSource=source;
  $('#translation-form select').innerHTML=available.map(l=>`<option value="${escapeHtml(l.code)}" ${l.code===language?'selected':''}>${escapeHtml(l.label)}${l.status==='live'?'':'（草稿）'}</option>`).join('');
  $('#translation-dialog').showModal();
}
$('#translation-cancel').addEventListener('click',()=>$('#translation-dialog').close());
$('#translation-form').addEventListener('submit',event=>{
  event.preventDefault();const lang=event.currentTarget.elements.targetLanguage.value,source=translationSource;
  $('#translation-dialog').close();section='posts';setSection();postLocale=lang;
  const base=`stories/${source.slug.replaceAll('/','-')}-${lang.toLowerCase()}`;let slug=base,index=2;
  while(state.posts.some(p=>p.slug===slug))slug=`${base}-${index++}`;
  draft={slug,meta:{...copy(source.meta),title:'',lang,draft:true},body:'',translationSource:source.slug};
  delete draft.meta.language;delete draft.meta.translationKey;
  isNew=true;dirty=true;renderList();renderEditor();markDirty();
});

load().catch(error=>studioStatus(`无法连接工作台：${error.message}`,true));

export {};
