import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(fileURLToPath(new URL('..', import.meta.url))));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server = createServer(async (req,res)=>{
  try { const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]); const relative = pathname === '/' ? '/web/index.html' : pathname; const file = normalize(join(root, relative)); if (!file.startsWith(root)) throw new Error('Forbidden'); const info = await stat(file); if (!info.isFile()) throw new Error('Not found'); res.writeHead(200, {'Content-Type':types[extname(file)] ?? 'application/octet-stream'}); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.PORT ?? 4173), '0.0.0.0', ()=>console.log(`ICN Operations Center: http://localhost:${process.env.PORT ?? 4173}`));
