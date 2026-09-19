import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { marked } from 'marked';
import { createStore, fail } from './studio-store.mjs';

export function createStudioServer(root, port=4322) {
  const store=createStore(root), token=randomBytes(32).toString('hex');
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  const server=http.createServer(async(req,res)=>{
    const boundPort=server.address()?.port || port;
    const origin=`http://127.0.0.1:${boundPort}`;
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
    try {
      if(req.headers.host!==`127.0.0.1:${boundPort}`) fail('请通过本机编辑器地址访问',403);
      if(req.headers.origin && req.headers.origin!==origin) fail('拒绝跨站请求',403);
      if(req.headers['sec-fetch-site']==='cross-site') fail('拒绝跨站请求',403);
      const url=new URL(req.url,origin);
      if(req.method==='GET' && url.pathname==='/api/state') return json(res,200,{...store.snapshot(),token});
      if(req.method==='POST' && url.pathname.startsWith('/api/')) {
        if(req.headers['x-studio-token']!==token) fail('编辑会话已失效，请重新载入',403);
        if(!req.headers['content-type']?.startsWith('application/json')) fail('需要 JSON 请求');
        let size=0;const chunks=[];
        for await(const chunk of req){size+=chunk.length;if(size>16_000_000)fail('请求超过大小限制',413);chunks.push(chunk);}
        const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const handlers={ '/api/post':store.savePost,'/api/work':store.saveWork,'/api/dictionary':store.saveDictionary,'/api/locale':store.addLocale,'/api/upload':store.upload,'/api/article-relations':store.saveRelations };
        if(url.pathname==='/api/preview') {
          if(typeof input.body!=='string' || input.body.length>1_000_000)fail('正文过长');
          // Rendered in a sandboxed iframe with scripts/forms/navigation disabled.
          const html=marked.parse(input.body,{breaks:true}).replace(/(src|href)=(['"])\/(?!\/)/g,'$1=$2/asset/');
          return json(res,200,{html});
        }
        const handler=handlers[url.pathname];if(!handler)fail('接口不存在',404);
        return json(res,200,handler(input));
      }
      if(req.method!=='GET')fail('请求方法不支持',405);
      let file;
      if(url.pathname.startsWith('/asset/')) {
        const relative=decodeURIComponent(url.pathname.slice(7));
        if(!/\.(png|jpe?g|gif|webp|svg)$/i.test(relative))fail('仅提供图片素材',404);
        file=store.safe(`public/${relative}`);
      } else {
        const allowed={'/':'index.html','/studio.js':'studio.js','/studio.css':'studio.css','/article-relations.mjs':'article-relations.mjs','/relation-canvas.js':'relation-canvas.js'};
        if(!allowed[url.pathname])fail('页面不存在',404);
        file=store.safe(`tools/content-studio/${allowed[url.pathname]}`);
      }
      if(!fs.existsSync(file))fail('文件不存在',404);
      res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream'});
      fs.createReadStream(file).pipe(res);
    } catch(error) { json(res,error.status || 400,{error:error.message || '操作失败'}); }
  });
  return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const port=Number(process.env.STUDIO_PORT || 4322);
  if(!Number.isInteger(port) || port<1024 || port>65535)throw new Error('STUDIO_PORT 应为 1024–65535');
  const server=createStudioServer(root,port);
  server.on('error',error=>{console.error(`编辑器启动失败：${error.message}`);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`MOEQY 内容工作台：http://127.0.0.1:${port}\n保存到本地源文件；自动备份在 .content-studio/backups。不会发布网站。`));
}
