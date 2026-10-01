// Servidor local para revisar /dist. Vuelve a generar el sitio cuando cambia algo en data/, public/ o src/
// (por ejemplo, al guardar desde el panel /admin). Uso: npm run dev
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const tipos = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain', '.yml': 'text/yaml; charset=utf-8', '.json': 'application/json' };
const puerto = Number(process.env.PORT) || 4321;

createServer(async (req, res) => {
  let ruta = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    if ((await stat(ruta)).isDirectory()) ruta = join(ruta, 'index.html');
    res.writeHead(200, { 'content-type': tipos[extname(ruta)] || 'application/octet-stream' });
    res.end(await readFile(ruta));
  } catch {
    res.writeHead(404, { 'content-type': tipos['.html'] });
    res.end(await readFile(join(dist, '404.html')));
  }
}).listen(puerto, () => console.log(`Print Home en http://localhost:${puerto}`));

let espera;
const regenerar = () => {
  clearTimeout(espera);
  espera = setTimeout(() => execFile(process.execPath, [join(raiz, 'scripts', 'build.mjs')], (err, salida) => {
    console.log(err ? err.message : salida.split('\n')[0]);
  }), 300);
};
for (const carpeta of ['data', 'public', 'src']) watch(join(raiz, carpeta), { recursive: true }, regenerar);

// Servidor del panel /admin en modo local (guarda directo en data/ y public/img/subidas/).
const panel = spawn(join(raiz, 'node_modules', '.bin', 'decap-server'), { cwd: raiz, stdio: 'inherit', env: { ...process.env, PORT: '8081' } });
panel.on('error', () => console.log('Panel: falta instalar dependencias (npm install).'));
process.on('exit', () => panel.kill());
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
