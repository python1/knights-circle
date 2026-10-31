import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files = new Map([['/', ['index.html','text/html']],['/src/app.js',['src/app.js','text/javascript']],['/src/providers.js',['src/providers.js','text/javascript']],['/src/oauth.js',['src/oauth.js','text/javascript']],['/src/markdown.js',['src/markdown.js','text/javascript']],['/src/ollama-guide.js',['src/ollama-guide.js','text/javascript']],['/src/style.css',['src/style.css','text/css']]]);
export const server = http.createServer(async(req,res)=>{
  const entry=files.get(new URL(req.url,'http://localhost').pathname);
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src https://api.openai.com https://api.anthropic.com https://api.x.ai https://generativelanguage.googleapis.com https://openrouter.ai http://localhost:11434 http://127.0.0.1:11434; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Cache-Control','no-store');
  if(!entry || !['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return;}
  try {const body=await readFile(new URL(entry[0],import.meta.url));res.setHeader('Content-Type',entry[1]+'; charset=utf-8');res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(500);res.end('Unable to load application.');}
});
server.listen(4173,'127.0.0.1',()=>process.stdout.write('Local: http://127.0.0.1:4173\n'));
