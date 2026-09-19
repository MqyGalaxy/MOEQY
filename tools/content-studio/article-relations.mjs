// Shared by the canvas preview and the local service: identical group constraints.
export const postLanguage = post => post.meta.lang || post.meta.language || 'zh-CN';
export function postTime(post) {
  const value=String(post.meta.date || '').replaceAll('/','-');
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if(!match)return -Infinity;
  const [,year,month,day,hour='00',minute='00',second='00']=match;
  const normalized=`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`,stamp=Date.parse(normalized);
  return Number.isFinite(stamp) && new Date(stamp).toISOString()===normalized ? stamp : -Infinity;
}
export const comparePosts=(a,b)=>{
  const first=postTime(a),second=postTime(b);
  return first===second ? (a.slug<b.slug?-1:a.slug>b.slug?1:0) : first>second?-1:1;
};
export const postDate=post=>Number.isFinite(postTime(post))?String(post.meta.date).replaceAll('/','-'):'未设置有效发布时间';
export const postStatus=post=>post.meta.draft?'草稿':post.meta.lang?'公开':'未加入列表';
export function relationGroups(posts) {
  const groups=new Map();
  for(const post of posts){
    const key=post.meta.translationKey || null,id=key?`group:${key}`:`post:${post.slug}`;
    if(!groups.has(id))groups.set(id,{id,key,posts:[]});
    groups.get(id).posts.push(post);
  }
  return [...groups.values()].map(group=>({...group,posts:group.posts.sort(comparePosts)})).sort((a,b)=>comparePosts(a.posts[0],b.posts[0]));
}
export function assertUniqueLanguages(posts){
  for(const group of relationGroups(posts)){
    const seen=new Map();
    for(const post of group.posts){
      const lang=postLanguage(post);
      if(seen.has(lang))throw new Error(`语言冲突（${lang}）：${seen.get(lang).meta.title} [${seen.get(lang).slug}] 与 ${post.meta.title} [${post.slug}]。请先解除其中一篇的绑定。`);
      seen.set(lang,post);
    }
  }
}
function newGroupKey(slug,posts){
  let hash=2166136261;
  for(const char of slug)hash=Math.imul(hash^char.charCodeAt(0),16777619);
  const base=`article-${(hash>>>0).toString(16)}`,used=new Set(posts.map(p=>p.meta.translationKey));
  let key=base,index=2;while(used.has(key))key=`${base}-${index++}`;return key;
}
export function applyRelationOperations(posts,operations){
  if(!Array.isArray(operations) || operations.length>200)throw new Error('关系操作格式错误或数量过多');
  const result=posts.map(post=>({...post,meta:{...post.meta}}));
  const find=slug=>{const post=result.find(p=>p.slug===slug);if(!post)throw new Error(`文章不存在：${slug}`);return post;};
  for(const operation of operations){
    if(operation.type==='unbind'){find(operation.slug).meta.translationKey=null;continue;}
    if(operation.type!=='bind')throw new Error('未知关系操作');
    const source=find(operation.source),target=find(operation.target);
    const sourceKey=source.meta.translationKey,targetKey=target.meta.translationKey;
    const key=sourceKey || targetKey || newGroupKey(source.slug,result);
    const members=result.filter(p=>p.slug===source.slug || p.slug===target.slug || (sourceKey && p.meta.translationKey===sourceKey) || (targetKey && p.meta.translationKey===targetKey));
    const candidate=members.map(p=>({...p,meta:{...p.meta,translationKey:key}}));
    assertUniqueLanguages(candidate);
    for(const member of members)member.meta.translationKey=key;
  }
  assertUniqueLanguages(result);return result;
}
