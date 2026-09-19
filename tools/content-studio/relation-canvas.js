import { applyRelationOperations, relationGroups, postLanguage, postDate, postStatus } from './article-relations.mjs';

const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
export function mountRelationCanvas(container,options){
  let posts=options.posts,locales=options.locales,operations=[],preview=posts,focusSlug=options.focusSlug;
  let scale=1,pan={x:0,y:0},gesture=null,saveBusy=false,disposed=false,candidateLanguage='',candidateQuery='';
  const controller=new AbortController(),listen=(el,event,fn)=>el.addEventListener(event,fn,{signal:controller.signal});
  const q=selector=>container.querySelector(selector);
  container.innerHTML=`<div class="relation-workspace"><div class="relation-heading"><div><p class="eyebrow">ONE STORY · MANY LANGUAGES</p><h2 data-group-title></h2><small data-group-id></small></div><button type="button" data-candidates-open>绑定已有文章</button></div>
    <p class="relation-help">从连接点拖线到右侧候选文章，或点击候选文章的“绑定”。操作先预览，保存后生效。</p>
    <p class="relation-error" role="alert" hidden></p>
    <div class="relation-layout"><section class="graph-shell" aria-label="文章语言关系画布">
      <div class="graph-toolbar"><button type="button" data-zoom="out" aria-label="缩小画布">缩小</button><output aria-label="画布比例" data-zoom-value></output><button type="button" data-zoom="in" aria-label="放大画布">放大</button><button type="button" data-fit>适应画布</button><button type="button" data-center>居中</button></div>
      <div class="graph-viewport" tabindex="0" aria-label="拖动空白区域移动画布；使用上方按钮缩放">
        <div class="graph-world"><svg class="graph-edges" aria-hidden="true"></svg><div class="graph-nodes"></div></div>
      </div><p class="graph-legend"><span>实线：已有版本</span><span>虚线：待补充语言</span><span>粉色标记：待保存修改</span></p>
    </section>
    <aside class="relation-candidates" aria-label="待绑定文章"><div class="candidate-heading"><h3>候选文章</h3><button type="button" data-candidates-close>关闭</button></div><label>语言<select data-candidate-language><option value="">全部语言</option>${locales.map(l=>`<option value="${escape(l.code)}">${escape(l.label)}</option>`).join('')}</select></label><label>查找文章<input type="search" data-candidate-search placeholder="标题或文章路径"></label><div class="candidate-list"></div></aside></div>
    <div class="relation-pending"><h3>待保存关系 <span data-pending-count>0</span></h3><ul data-pending-summary></ul><div class="relation-actions"><button type="button" data-undo>撤销上一步</button><button type="button" data-discard>取消全部修改</button><button type="button" class="primary" data-save-relations>保存关系</button></div></div>
    <svg class="connection-drag" aria-hidden="true"><path fill="none" stroke="#e65097" stroke-width="3" stroke-dasharray="7 5"/></svg>
    <dialog class="relation-detail"><div data-node-detail></div><div class="dialog-actions"><button type="button" data-detail-close>关闭</button><button type="button" class="primary" data-detail-edit>编辑文章</button></div></dialog></div>`;
  const viewport=q('.graph-viewport'),world=q('.graph-world'),dialog=q('.relation-detail');
  let worldWidth=760,worldHeight=480,detailSlug=null;
  function group(){return relationGroups(preview).find(g=>g.posts.some(p=>p.slug===focusSlug));}
  function showError(error){q('.relation-error').hidden=false;q('.relation-error').textContent=error.message;options.onStatus(error.message,true);}
  function transform(){world.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${scale})`;q('[data-zoom-value]').textContent=`${Math.round(scale*100)}%`;}
  function center(){pan={x:(viewport.clientWidth-worldWidth*scale)/2,y:(viewport.clientHeight-worldHeight*scale)/2};transform();}
  function fit(){scale=Math.max(.15,Math.min(1,(viewport.clientWidth-30)/worldWidth,(viewport.clientHeight-30)/worldHeight));center();}
  function changed(slug){return posts.find(p=>p.slug===slug)?.meta.translationKey!==preview.find(p=>p.slug===slug)?.meta.translationKey;}
  function drawCandidates(){
    const current=group(),members=new Set(current.posts.map(p=>p.slug));
    const candidates=preview.filter(p=>!members.has(p.slug) && (!candidateLanguage || postLanguage(p)===candidateLanguage) && `${p.meta.title} ${p.slug}`.toLowerCase().includes(candidateQuery.toLowerCase()));
    q('.candidate-list').innerHTML=candidates.map(post=>`<article class="candidate-node" data-drop-slug="${escape(post.slug)}"><span>${escape(locales.find(l=>l.code===postLanguage(post))?.label || postLanguage(post))} · ${postStatus(post)}</span><b>${escape(post.meta.title)}</b><small>${escape(post.slug)}</small>${post.meta.translationKey?'<em>已绑定其他组 · 将尝试整组合并</em>':''}<button type="button" data-bind="${escape(post.slug)}">绑定 ${arrow}</button></article>`).join('') || '<p class="editor-note">暂无可绑定文章。可以切换语言筛选或新建译文。</p>';
  }
  function draw(){
    preview=applyRelationOperations(posts,operations);
    const current=group();
    const title=current.posts.find(p=>postLanguage(p)==='zh-CN')?.meta.title || current.posts[0].meta.title;
    q('[data-group-title]').textContent=title;q('[data-group-id]').textContent=current.key || '未绑定文章';
    const languages=[...locales];
    for(const code of new Set(current.posts.map(postLanguage)))if(!languages.some(l=>l.code===code))languages.push({code,label:code,status:'draft'});
    const narrow=viewport.clientWidth>0 && viewport.clientWidth<480;
    worldWidth=narrow?380:760;worldHeight=narrow?languages.length*195+230:Math.max(450,languages.length*195+40);
    world.style.width=`${worldWidth}px`;world.style.height=`${worldHeight}px`;
    const cy=narrow?95:worldHeight/2,centerY=cy-75;
    let nodes=`<article class="graph-node graph-group" style="left:${narrow?70:35}px;top:${centerY}px;width:240px;height:150px"><small>文章组</small><h3>${escape(title)}</h3><span>${current.posts.length} 个语言版本</span><button class="connection-port" type="button" data-port="${escape(focusSlug)}" aria-label="从文章组拖线绑定，或点击选择候选文章">${arrow}</button></article>`;
    let edges='';
    languages.forEach((locale,index)=>{
      const post=current.posts.find(p=>postLanguage(p)===locale.code),y=(narrow?225:25)+index*195;
      edges+=`<path class="${post?'':'missing-edge'}" d="${narrow?`M70 ${cy} H10 V${y+80} H25`:`M275 ${cy} C330 ${cy},330 ${y+80},380 ${y+80}`}"/>`;
      nodes+=`<article class="graph-node ${post?'':'missing-node'} ${post&&changed(post.slug)?'pending-node':''}" style="left:${narrow?25:380}px;top:${y}px;width:330px;min-height:160px" ${post?`data-drop-slug="${escape(post.slug)}"`:''}><span class="node-locale">${escape(locale.label)}${locale.status==='live'?'':' · 准备中'}</span>${post?`<button type="button" class="node-title" data-detail="${escape(post.slug)}">${escape(post.meta.title)}</button><small>${escape(postDate(post))} · ${postStatus(post)}</small><div class="node-actions"><button type="button" data-detail="${escape(post.slug)}">查看文章</button>${current.key?`<button type="button" data-unbind="${escape(post.slug)}">解除绑定</button>`:''}</div><button class="connection-port" type="button" data-port="${escape(post.slug)}" aria-label="从${escape(locale.label)}文章拖线绑定，或点击选择候选文章">${arrow}</button>`:`<h3>待补充语言版本</h3><div class="node-actions"><button type="button" data-choose-language="${escape(locale.code)}">绑定已有文章</button><button type="button" data-create-language="${escape(locale.code)}">新建译文</button></div>`}</article>`;
    });
    q('.graph-edges').setAttribute('width',worldWidth);q('.graph-edges').setAttribute('height',worldHeight);q('.graph-edges').innerHTML=edges;q('.graph-nodes').innerHTML=nodes;
    q('[data-pending-count]').textContent=String(operations.length);
    q('[data-pending-summary]').innerHTML=operations.length?operations.map(op=>`<li>${op.type==='unbind'?`解除绑定：${escape(posts.find(p=>p.slug===op.slug)?.meta.title || op.slug)}`:`绑定／合并：${escape(posts.find(p=>p.slug===op.source)?.meta.title)} → ${escape(posts.find(p=>p.slug===op.target)?.meta.title)}`}</li>`).join(''):'<li>尚无修改。拖线或选择文章开始绑定。</li>';
    for(const selector of ['[data-save-relations]','[data-undo]','[data-discard]'])q(selector).disabled=!operations.length || saveBusy;
    options.onDirty(operations.length>0);drawCandidates();transform();
  }
  function stage(operation){
    if(saveBusy)return;
    try{
      const after=applyRelationOperations(posts,[...operations,operation]);
      if(after.every((post,index)=>post.meta.translationKey===preview[index].meta.translationKey))return;
      operations.push(operation);q('.relation-error').hidden=true;draw();
      options.onStatus('关系已加入预览，点击“保存关系”后生效。');
    }catch(error){showError(error);}
  }
  function openCandidates(language=''){
    candidateLanguage=language;q('[data-candidate-language]').value=language;drawCandidates();
    q('.relation-candidates').classList.add('is-open');q('[data-candidate-search]').focus();
  }
  function closeCandidates(){q('.relation-candidates').classList.remove('is-open');q('[data-candidates-open]').focus();}
  function detail(slug){
    const post=preview.find(p=>p.slug===slug);detailSlug=slug;
    const summary=post.body.replace(/<[^>]*>/g,'').replace(/[#*_`]/g,'').trim().slice(0,350);
    q('[data-node-detail]').innerHTML=`<p class="eyebrow">${escape(postLanguage(post))} · ${postStatus(post)}</p><h2>${escape(post.meta.title)}</h2><small>${escape(postDate(post))} · ${escape(post.slug)}</small><p class="relation-excerpt">${escape(summary)}${post.body.length>350?'…':''}</p>`;
    dialog.showModal();
  }
  listen(container,'click',async event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-bind'))stage({type:'bind',source:focusSlug,target:target.dataset.bind});
    if(target.hasAttribute('data-unbind'))stage({type:'unbind',slug:target.dataset.unbind});
    if(target.hasAttribute('data-detail'))detail(target.dataset.detail);
    if(target.hasAttribute('data-detail-close'))dialog.close();
    if(target.hasAttribute('data-detail-edit')){dialog.close();await options.onEdit(detailSlug);}
    if(target.hasAttribute('data-choose-language'))openCandidates(target.dataset.chooseLanguage);
    if(target.hasAttribute('data-create-language'))await options.onCreate(focusSlug,target.dataset.createLanguage);
    if(target.hasAttribute('data-candidates-open'))openCandidates();
    if(target.hasAttribute('data-candidates-close'))closeCandidates();
    if(target.hasAttribute('data-port'))openCandidates();
    if(target.hasAttribute('data-fit'))fit();
    if(target.hasAttribute('data-center'))center();
    if(target.hasAttribute('data-zoom')){
      const previous=scale;scale=Math.min(1.8,Math.max(.15,scale*(target.dataset.zoom==='in'?1.2:1/1.2)));
      pan={x:viewport.clientWidth/2-(viewport.clientWidth/2-pan.x)*scale/previous,y:viewport.clientHeight/2-(viewport.clientHeight/2-pan.y)*scale/previous};transform();
    }
    if(target.hasAttribute('data-undo')){operations.pop();draw();}
    if(target.hasAttribute('data-discard')){operations=[];draw();q('.relation-error').hidden=true;}
    if(target.hasAttribute('data-save-relations') && !saveBusy && operations.length){
      saveBusy=true;draw();
      try{const next=await options.onSave(operations);if(disposed)return;posts=next.posts;locales=next.locales;operations=[];q('.relation-error').hidden=true;}
      catch(error){showError(error);}finally{saveBusy=false;if(!disposed)draw();}
    }
  });
  listen(q('[data-candidate-language]'),'change',event=>{candidateLanguage=event.target.value;drawCandidates();});
  listen(q('[data-candidate-search]'),'input',event=>{candidateQuery=event.target.value;drawCandidates();});
  listen(dialog,'click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)dialog.close();}});
  listen(container,'keydown',event=>{if(event.key==='Escape' && !dialog.open){if(gesture)endGesture();else closeCandidates();}});
  // Pointer capture supports mouse, pen and touch; document hit testing finds candidate drop targets.
  listen(viewport,'pointerdown',event=>{
    if(event.button!==0 || saveBusy)return;
    const port=event.target.closest('[data-port]');
    if(!port && event.target.closest('.graph-node,button'))return;
    event.preventDefault();viewport.setPointerCapture(event.pointerId);
    const r=port?.getBoundingClientRect();
    gesture=port?{kind:'connect',source:port.dataset.port,start:{x:r.left+r.width/2,y:r.top+r.height/2},moved:false}:{kind:'pan',start:{x:event.clientX,y:event.clientY},pan:{...pan},moved:false};
    if(port)q('.relation-candidates').classList.add('is-open');
  });
  listen(viewport,'pointermove',event=>{
    if(!gesture)return;
    gesture.moved=true;
    if(gesture.kind==='pan'){pan={x:gesture.pan.x+event.clientX-gesture.start.x,y:gesture.pan.y+event.clientY-gesture.start.y};transform();return;}
    const line=q('.connection-drag');line.classList.add('active');
    const {x,y}=gesture.start;line.querySelector('path').setAttribute('d',`M${x} ${y} C${x+80} ${y},${event.clientX-80} ${event.clientY},${event.clientX} ${event.clientY}`);
    q('.drop-ready')?.classList.remove('drop-ready');
    document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-drop-slug]')?.classList.add('drop-ready');
  });
  function endGesture(){gesture=null;q('.connection-drag').classList.remove('active');q('.drop-ready')?.classList.remove('drop-ready');}
  listen(viewport,'pointerup',event=>{
    if(!gesture)return;
    if(gesture.kind==='connect' && gesture.moved){
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-drop-slug]');
      if(target && target.dataset.dropSlug!==gesture.source)stage({type:'bind',source:gesture.source,target:target.dataset.dropSlug});
    }
    endGesture();if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
  });
  listen(viewport,'pointercancel',endGesture);
  const observer=new ResizeObserver(()=>{if(!disposed){draw();fit();}});observer.observe(viewport);
  draw();fit();
  return {destroy(){disposed=true;controller.abort();observer.disconnect();dialog.close();},pending:()=>operations};
}
