import {mkdir,copyFile,rm,stat} from 'node:fs/promises';
const files=['index.html','src/app.js','src/style.css','src/providers.js','src/oauth.js','src/markdown.js','src/vm-zip.js','src/vm-pack-core.js','src/vm-verify.js','src/memory-pack.js','src/ollama-guide.js','src/rooms.js','src/room-ui.js','src/memory.js','src/export.js','manifest.webmanifest','icon.svg','sw.js'];
await rm('dist',{recursive:true,force:true});await mkdir('dist/src',{recursive:true});
for(const file of files){try{await stat(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}await copyFile(file,'dist/'+file);}
