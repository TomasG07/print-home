# Print Home · sitio web

Sitio estático de Print Home ("Calidad al instante"). Fase 1 de las HU: HU-01 a HU-08 y la parte técnica de HU-12.

## Uso

```bash
npm run dev     # genera dist/ y lo sirve en http://localhost:4321
npm run build   # solo genera dist/ (esa carpeta es la que se publica)
```

No necesita dependencias, solo Node 18 o superior. Al terminar, el build lista los **datos pendientes del cliente**.

## Panel de administración (`/admin`)

El dueño edita todo desde un panel con formularios (Decap CMS), sin tocar código:

- **Productos:** agregar, editar, ocultar o borrar; precio, entrega, materiales y fotos. Cada producto nuevo tiene su página automáticamente.
- **Trabajos (galería):** subir fotos de trabajos nuevos y elegir el filtro.
- **Datos del negocio:** WhatsApp, teléfono, dirección, horario, redes, el titular y la foto de la portada.
- **Antes y después** y **Preguntas frecuentes.**

**Probarlo en la compu:** `npm install` (una sola vez) y `npm run dev`. Abrí `http://localhost:4321/admin/`, tocá "Iniciar sesión" (en la compu no pide contraseña) y editá. Al guardar, el sitio se regenera solo.

**En producción:** el código se sube a un repositorio de GitHub (hay que poner su nombre en `public/admin/config.yml`, en `repo`) y se publica en Cloudflare Pages o Netlify. Para que el dueño entre con **correo y contraseña** (sin cuenta de GitHub) se usa DecapBridge (gratis hasta 10 usuarios): se crea el sitio ahí, se pega en `config.yml` el bloque `backend` que indica, y se lo invita por correo. El dueño entra a `https://su-dominio/admin/`, inicia sesión, edita y guarda; el sitio se vuelve a publicar solo en uno o dos minutos.

Los archivos que edita el panel están en `data/` (`negocio.json`, `mundos.json`, `antes-despues.json`, `faq.json`, `productos/*.json` y `trabajos/*.json`), y las fotos que se suben quedan en `public/img/subidas/`.

## Datos y fotos de muestra

Hoy el sitio tiene datos y fotos **de muestra**: las fotos son de Unsplash (uso libre) y el teléfono y el WhatsApp son ficticios (`0000`). Antes de publicar hay que reemplazarlos por los reales desde el panel.

## Medición

Cada clic a WhatsApp o a llamar envía `clic_whatsapp` / `clic_llamar` a `dataLayer` (y a `gtag` o Plausible si están instalados) con `producto` y `origen`.

## Publicación

Cualquier hosting estático con HTTPS y dominio propio (Cloudflare Pages, Netlify o GitHub Pages, gratis). Comando de build: `npm run build`; carpeta de salida: `dist`. Con `url` cargado en `negocio.json` se generan `sitemap.xml` y las URL canónicas.
