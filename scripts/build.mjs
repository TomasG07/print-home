// Genera el sitio estático en /dist a partir de los archivos de /data.
// Uso: node scripts/build.mjs
// Los datos se editan desde el panel /admin (o a mano en /data).
import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const leer = async (f) => JSON.parse(await readFile(join(raiz, 'data', f), 'utf8'));
// Lee una carpeta de JSON (un archivo por producto o trabajo); el nombre del archivo es el slug.
const leerCarpeta = async (carpeta) => {
  const archivos = (await readdir(join(raiz, 'data', carpeta))).filter((f) => f.endsWith('.json'));
  return Promise.all(archivos.map(async (f) => ({ slug: basename(f, '.json'), ...(await leer(join(carpeta, f))) })));
};
// Si el sitio vive en una subcarpeta (ej. GitHub Pages: /print-home), BASE_PATH la agrega a todos los enlaces.
const base = (process.env.BASE_PATH || '').replace(/\/$/, '');
const conBase = (html) => (base ? html.replace(/(href|src|data-url)="\/(?!\/)/g, `$1="${base}/`) : html);
const escribirHtml = (ruta, html) => writeFile(ruta, conBase(html));

const porOrden = (a, b) => (a.orden ?? 99) - (b.orden ?? 99);

const negocio = await leer('negocio.json');
const tema = await leer('tema.json');
const textos = await leer('textos.json');
const { mundos } = await leer('mundos.json');
const faq = await leer('faq.json');
const antesDespues = await leer('antes-despues.json');
const listaProductos = (await leerCarpeta('productos')).filter((p) => p.publicado !== false).sort(porOrden);
const productos = Object.fromEntries(listaProductos.map((p) => [p.slug, p]));
const trabajos = (await leerCarpeta('trabajos')).filter((t) => productos[t.producto]).sort(porOrden);
const catalogo = {
  mundos: mundos.map((m) => ({ ...m, productos: listaProductos.filter((p) => p.mundo === m.id).map((p) => p.slug) })).filter((m) => m.productos.length),
};

const pendientes = [];
const anotar = (donde) => pendientes.push(donde);

// ---------- utilidades ----------
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const porConfirmar = (valor, donde, texto = 'por confirmar') => {
  if (valor !== null && valor !== undefined && valor !== '') return esc(valor);
  anotar(donde);
  return `<span class="pendiente">${texto}</span>`;
};

// Títulos tipo afiche: corte de línea después de la primera palabra.
const afiche = (t = '') => {
  const [primera, ...resto] = t.trim().split(/\s+/);
  return resto.length ? `${esc(primera)} <br>${esc(resto.join(' '))}` : esc(primera);
};

// Colores del panel → variables CSS que pisan los valores por defecto de estilos.css.
const varsTema = {
  fondo: '--papel', tinta: '--tinta', boton: '--accion', botonTexto: '--accion-texto', botonSombra: '--accion-sombra',
  botonOscuro: '--accion-oscuro', botonOscuroTexto: '--accion-oscuro-texto', acento: '--acento', resaltado: '--resaltado',
  paso1: '--paso-1', paso2: '--paso-2', paso3: '--paso-3',
};
const estiloTema = () => {
  const reglas = Object.entries(varsTema)
    .filter(([k]) => /^#[0-9a-f]{3,8}$/i.test(tema[k] || ''))
    .map(([k, v]) => `${v}:${tema[k]}`);
  return reglas.length ? `<style>:root{${reglas.join(';')}}</style>` : '';
};

const colones = (n) => '₡' + new Intl.NumberFormat('es-CR').format(n);

const urlWa = (mensaje) =>
  `https://wa.me/${negocio.whatsapp ? String(negocio.whatsapp).replace(/\D/g, '') : ''}?text=${encodeURIComponent(mensaje)}`;

// Enlace a WhatsApp con evento de medición (el evento lo registra main.js).
const botonWa = (texto, mensaje, { clase = 'btn btn--wa', producto = 'general', origen = '' } = {}) =>
  `<a class="${clase}" href="${esc(urlWa(mensaje))}" target="_blank" rel="noopener" data-track="whatsapp" data-producto="${esc(producto)}" data-origen="${esc(origen)}">${iconoWa}<span>${texto}</span></a>`;

const iconoWa = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>`;

const precioTexto = (p, donde) =>
  p.precioDesde ? `Desde ${colones(p.precioDesde)} <small>${esc(p.unidad)}</small>` : porConfirmar(null, donde, '₡ por confirmar');

// Foto real o marcador "foto pendiente" (para la sesión de fotos de HU-12).
// f = { foto: '/img/subidas/x.jpg' | 'https://...', alt }. Sin foto se muestra el marcador.
const foto = (f, { clase = '', eager = false, sizes = '100vw' } = {}) => {
  const src = f?.foto || f?.src;
  if (src) {
    const carga = eager ? 'fetchpriority="high"' : 'loading="lazy"';
    let atributos = `src="${esc(src)}"`;
    // Las fotos de muestra de Unsplash se piden al tamaño justo.
    if (src.startsWith('https://images.unsplash.com/')) {
      const u = (w) => `${src}?w=${w}&q=70&auto=format&fit=crop`;
      atributos = `src="${esc(u(1200))}" srcset="${[480, 800, 1200, 1800].map((w) => `${esc(u(w))} ${w}w`).join(', ')}"`;
    }
    return `<img class="${clase}" ${atributos} alt="${esc(f.alt || '')}" width="1600" height="1200" sizes="${sizes}" ${carga} decoding="async">`;
  }
  return `<div class="foto-pendiente ${clase}" role="img" aria-label="${esc(f?.alt || 'Foto pendiente')}"><span class="foto-pendiente__tag">Foto pendiente</span><span class="foto-pendiente__txt">${esc(f?.alt || '')}</span></div>`;
};

const ficha = (p, slug) =>
  [
    p.materiales?.[0] && `Material: ${esc(p.materiales[0].toLowerCase())}`,
    p.acabado && `Acabado: ${esc(p.acabado.toLowerCase())}`,
    `Entrega: ${p.entrega ? esc(p.entrega) : porConfirmar(null, `productos.${slug}.entrega`)}`,
  ].filter(Boolean).join(' · ');

const barraCmyk = (etiqueta = '') =>
  `<div class="cmyk" aria-hidden="true"><div class="cmyk__barra"></div>${etiqueta ? `<span class="cmyk__txt">${esc(etiqueta)}</span>` : ''}</div>`;

const mundoDe = (slug) => catalogo.mundos.find((m) => m.productos.includes(slug));

// ---------- SEO ----------
const urlAbs = (ruta) => (negocio.url ? negocio.url.replace(/\/$/, '') + ruta : null);

const jsonLdNegocio = () => {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: negocio.nombre,
    slogan: negocio.eslogan,
    description: 'Imprenta: rótulos, letras corpóreas, vinil, impresos y decoración para fiestas.',
  };
  if (negocio.url) { ld.url = negocio.url; ld.image = urlAbs(negocio.logoCompleto || '/img/logo-completo.jpg'); }
  if (negocio.telefono) ld.telephone = negocio.telefono;
  if (negocio.email) ld.email = negocio.email;
  if (negocio.direccion) ld.address = { '@type': 'PostalAddress', streetAddress: negocio.direccion, addressCountry: 'CR' };
  if (negocio.coordenadas) ld.geo = { '@type': 'GeoCoordinates', latitude: negocio.coordenadas.lat, longitude: negocio.coordenadas.lng };
  const horas = negocio.horario.filter((h) => h.horas).map((h) => `${h.dias} ${h.horas}`);
  if (horas.length) ld.openingHours = horas;
  const redes = negocio.redes.filter((r) => r.url).map((r) => r.url);
  if (redes.length) ld.sameAs = redes;
  return ld;
};

// ---------- layout ----------
const pagina = ({ ruta, titulo, descripcion, cuerpo, ldExtra = [] }) => {
  const canonica = urlAbs(ruta);
  const ld = [jsonLdNegocio(), ...ldExtra];
  return `<!doctype html>
<html lang="es-CR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
${canonica ? `<link rel="canonical" href="${esc(canonica)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
${canonica ? `<meta property="og:url" content="${esc(canonica)}">\n<meta property="og:image" content="${esc(urlAbs(negocio.logoCompleto || '/img/logo-completo.jpg'))}">` : ''}
<meta name="theme-color" content="${esc(tema.fondo || '#F4F1EA')}">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=IBM+Plex+Mono:wght@400;600&family=Manrope:wght@400;600;800&family=Mr+Dafoe&display=swap">
<link rel="stylesheet" href="/estilos.css">
${estiloTema()}
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}
<script src="/main.js" defer></script>
</head>
<body>
<a class="saltar" href="#contenido">Saltar al contenido</a>
${encabezado()}
<main id="contenido">
${cuerpo}
</main>
${pie()}
</body>
</html>
`;
};

// Logo de la cabecera: la imagen cargada en el panel o, si no hay, el nombre en letra script.
const logoCabecera = () =>
  negocio.logo
    ? `<img class="cabecera__img" src="${esc(negocio.logo)}" alt="${esc(negocio.nombre)}" width="320" height="286">`
    : `<span class="logo-script">${esc(negocio.nombre)}</span>`;

const encabezado = () => `<header class="cabecera">
  <div class="cabecera__in">
    <a class="cabecera__logo" href="/" aria-label="${esc(negocio.nombre)}, inicio">${logoCabecera()}</a>
    <nav class="menu" id="menu" aria-label="Principal">
      <ul>
        <li><a href="/#productos">Productos</a></li>
        <li><a href="/#trabajos">Trabajos</a></li>
        <li><a href="/#como-pedir">Cómo pedir</a></li>
        <li><a href="/#contacto">Contacto</a></li>
      </ul>
    </nav>
    ${botonWa(esc(textos.botones.cabecera), negocio.mensajeWhatsApp + '.', { clase: 'btn btn--wa btn--chico cabecera__wa', origen: 'cabecera' })}
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu"><span class="menu-btn__barras" aria-hidden="true"></span><span class="sr">Menú</span></button>
  </div>
</header>`;

const pie = () => `<footer class="pie">
  ${barraCmyk('Print Home · Control de color')}
  <div class="pie__in">
    <img class="pie__logo" src="${esc(negocio.logoCompleto || '/img/logo-completo.jpg')}" alt="Logo de ${esc(negocio.nombre)}, ${esc(negocio.eslogan)}" width="800" height="716" loading="lazy">
    <div class="pie__col">
      <p class="pie__grande">${esc(textos.pie.frase)}</p>
      ${botonWa(esc(textos.botones.pie), negocio.mensajeWhatsApp + '.', { origen: 'pie' })}
    </div>
    <ul class="pie__links">
      ${catalogo.mundos.map((m) => m.productos.map((s) => `<li><a href="/productos/${s}/">${esc(productos[s].nombre)}</a></li>`).join('')).join('')}
    </ul>
  </div>
  <p class="pie__colofon">${esc(negocio.nombre)} · ${esc(negocio.eslogan)} · © ${new Date().getFullYear()} · Este sitio se imprimió a cuatro tintas.</p>
</footer>`;

// ---------- secciones de la portada ----------
// Las dos últimas palabras del titular van subrayadas en amarillo.
const titularHero = (t = '') => {
  const palabras = t.trim().split(/\s+/);
  const corte = Math.max(0, palabras.length - 2);
  return `${esc(palabras.slice(0, corte).join(' '))} <span class="subraya">${esc(palabras.slice(corte).join(' '))}</span>`;
};

const hero = () => `<section class="hero" aria-labelledby="hero-titulo">
  <div class="hero__texto">
    <p class="hero__pre mono">${esc(textos.heroEtiqueta)}</p>
    <h1 id="hero-titulo" class="hero__titulo">${titularHero(negocio.hero.titular)}</h1>
    <p class="hero__bajada">${esc(negocio.hero.bajada)}</p>
    <div class="hero__acciones">
      ${botonWa(esc(textos.botones.heroPrincipal), negocio.mensajeWhatsApp + '.', { origen: 'hero' })}
      <a class="btn btn--linea" href="#trabajos">${esc(textos.botones.heroSecundario)}</a>
    </div>
  </div>
  <figure class="hero__foto marcas revela">
    ${foto(negocio.hero, { eager: true, sizes: '(min-width: 900px) 60vw, 100vw' })}
  </figure>
  <dl class="datos">
    ${negocio.datosHero.map((d, i) => `<div class="datos__item"><dt class="mono">${esc(d.etiqueta)}</dt><dd>${porConfirmar(d.valor, `negocio.datosHero[${i}] (${d.etiqueta})`)}</dd></div>`).join('')}
    ${negocio.trabajosEntregados ? `<div class="datos__item"><dt class="mono">Entregados</dt><dd>+<span data-contador="${negocio.trabajosEntregados}">${new Intl.NumberFormat('es-CR').format(negocio.trabajosEntregados)}</span> trabajos</dd></div>` : ''}
  </dl>
</section>`;

const tarjetaProducto = (slug, i) => {
  const p = productos[slug];
  return `<li class="prod prod--${i}">
    <a class="prod__link" href="/productos/${slug}/">
      <div class="prod__foto marcas revela">${foto(p.fotos?.[0] || { alt: p.nombre }, { sizes: '(min-width: 900px) 40vw, 100vw' })}</div>
      <div class="prod__pie">
        <h4 class="prod__nombre">${esc(p.nombre)}</h4>
        <p class="prod__ficha mono">${ficha(p, slug)}</p>
      </div>
    </a>
  </li>`;
};

const seccionProductos = () => `<section class="productos" id="productos" aria-labelledby="productos-titulo">
  <h2 id="productos-titulo" class="titulo-afiche">${afiche(textos.productos.titulo)}</h2>
  ${catalogo.mundos.map((m, i) => `<section class="mundo mundo--${m.id}" aria-labelledby="mundo-${m.id}">
    <header class="mundo__cab">
      <span class="mundo__num mono">0${i + 1}</span>
      <h3 id="mundo-${m.id}" class="mundo__titulo">${esc(m.titulo)}</h3>
      <p class="mundo__bajada">${esc(m.bajada)}</p>
    </header>
    <ul class="mundo__lista">${m.productos.map(tarjetaProducto).join('')}</ul>
  </section>`).join('')}
</section>`;

const seccionTrabajos = () => {
  const ad = antesDespues;
  const filtros = [{ id: 'todos', titulo: 'Todos' }, ...catalogo.mundos.map((m) => ({ id: m.id, titulo: m.titulo.replace(/^Para /, '').replace(/^promocionar /, '') }))];
  return `<section class="trabajos" id="trabajos" aria-labelledby="trabajos-titulo">
  <div class="trabajos__cab">
    <h2 id="trabajos-titulo" class="titulo-afiche titulo-afiche--claro">${afiche(textos.trabajos.titulo)}</h2>
    <p class="trabajos__bajada">${esc(textos.trabajos.bajada)}</p>
  </div>

  ${ad.mostrar !== false && productos[ad.producto] ? `<figure class="ad">
    <div class="ad__marco" style="--pos:50%">
      <div class="ad__capa ad__capa--antes">${foto(ad.antes)}<span class="ad__etq mono">Antes</span></div>
      <div class="ad__capa ad__capa--despues">${foto(ad.despues)}<span class="ad__etq mono">Después</span></div>
      <div class="ad__linea" aria-hidden="true"></div>
      <input class="ad__control" type="range" min="0" max="100" value="50" aria-label="Comparar antes y después: deslizá para ver el cambio">
    </div>
    <figcaption class="mono">${esc(ad.titulo)} · ${esc(productos[ad.producto].nombre)} · ${esc(ad.material)}${ad.cliente ? ` · ${esc(ad.cliente)}` : ''}</figcaption>
  </figure>` : ''}

  <div class="filtros" role="group" aria-label="Filtrar trabajos por categoría">
    ${filtros.map((f, i) => `<button type="button" class="filtro" data-filtro="${f.id}" aria-pressed="${i === 0}">${esc(f.titulo.charAt(0).toUpperCase() + f.titulo.slice(1))}</button>`).join('')}
  </div>

  <ul class="galeria">
    ${trabajos.map((t) => {
      const p = productos[t.producto];
      return `<li class="galeria__item galeria__item--${t.forma || 'cuadrada'}" data-mundo="${t.mundo}">
      <button type="button" class="galeria__btn revela" data-producto="${esc(p.nombre)}" data-material="${esc(t.material)}" data-cliente="${esc(t.cliente || '')}" data-url="/productos/${t.producto}/">
        ${foto(t, { sizes: '(min-width: 900px) 33vw, 50vw' })}
        <span class="galeria__ficha mono">${esc(p.nombre)} · ${esc(t.material)}</span>
      </button>
    </li>`;
    }).join('')}
  </ul>

  <dialog class="caja" aria-label="Trabajo ampliado">
    <form method="dialog"><button class="caja__cerrar" aria-label="Cerrar">×</button></form>
    <div class="caja__foto"></div>
    <dl class="caja__ficha mono"></dl>
  </dialog>
</section>`;
};

const seccionComoPedir = () => `<section class="pedir" id="como-pedir" aria-labelledby="pedir-titulo">
  <h2 id="pedir-titulo" class="titulo-afiche">${afiche(textos.pedir.titulo)}</h2>
  <ol class="pasos">
    ${textos.pedir.pasos.map((p, i) => `<li class="paso"><span class="paso__num" aria-hidden="true">${i + 1}</span><h3>${esc(p.titulo)}</h3><p>${esc(p.texto)}</p></li>`).join('\n    ')}
  </ol>
  <details class="desplegable">
    <summary>${esc(textos.pedir.infoTitulo)}</summary>
    <ul class="checklist">${textos.pedir.info.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  </details>
  ${botonWa(esc(textos.botones.pedir), negocio.mensajeWhatsApp + '. Les cuento lo que necesito:', { origen: 'como-pedir' })}
</section>`;

const seccionFaq = () => `<section class="faq" id="preguntas" aria-labelledby="faq-titulo">
  <h2 id="faq-titulo" class="titulo-afiche titulo-afiche--chico">${afiche(textos.faq.titulo)}</h2>
  <div class="faq__lista">
    ${faq.preguntas.map((q, i) => `<details class="desplegable">
      <summary>${esc(q.pregunta)}</summary>
      <p>${porConfirmar(q.respuesta, `faq.preguntas[${i}] (${q.pregunta})`, 'Respuesta por confirmar con Print Home.')}</p>
    </details>`).join('')}
  </div>
</section>`;

const seccionContacto = () => {
  const tel = negocio.telefono;
  const mapa = negocio.mapsQuery || negocio.direccion;
  if (!mapa) anotar('negocio.mapsQuery (mapa)');
  return `<section class="contacto" id="contacto" aria-labelledby="contacto-titulo">
  <h2 id="contacto-titulo" class="contacto__titulo">${esc(textos.contacto.titulo)}<br><span>${esc(textos.contacto.subtitulo)}</span></h2>
  <div class="contacto__grid">
    <div class="contacto__vias">
      ${botonWa(esc(textos.botones.contacto), negocio.mensajeWhatsApp + '.', { clase: 'btn btn--wa btn--grande', origen: 'contacto' })}
      <dl class="contacto__datos">
        <div><dt class="mono">Teléfono</dt><dd>${tel ? `<a href="tel:${esc(tel.replace(/[^\d+]/g, ''))}" data-track="llamar" data-producto="general" data-origen="contacto">${esc(tel)}</a>` : porConfirmar(null, 'negocio.telefono')}</dd></div>
        <div><dt class="mono">Dirección</dt><dd>${porConfirmar(negocio.direccion, 'negocio.direccion')}</dd></div>
        ${negocio.redes?.some((r) => r.url) ? `<div><dt class="mono">Redes</dt><dd class="redes">${negocio.redes.filter((r) => r.url).map((r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.nombre)}</a>`).join('')}</dd></div>` : ''}
      </dl>
      <table class="horario mono">
        <caption>Horario</caption>
        <tbody>${negocio.horario.map((h) => `<tr><th scope="row">${esc(h.dias)}</th><td>${porConfirmar(h.horas, `negocio.horario (${h.dias})`)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="contacto__mapa marcas">
      ${mapa
        ? `<iframe title="Mapa de ubicación de Print Home" src="https://www.google.com/maps?q=${encodeURIComponent(mapa)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
        : `<div class="foto-pendiente" role="img" aria-label="Mapa pendiente"><span class="foto-pendiente__tag">Mapa pendiente</span><span class="foto-pendiente__txt">Falta la dirección del taller</span></div>`}
    </div>
  </div>
  <details class="desplegable formulario">
    <summary>${esc(textos.contacto.formularioTitulo)}</summary>
    <form class="form" data-form-wa>
      <label>Nombre<input name="nombre" autocomplete="name" required></label>
      <label>Teléfono o correo<input name="contacto" autocomplete="tel" required></label>
      <label>¿Qué necesitás?<textarea name="mensaje" rows="3" required></textarea></label>
      <button class="btn btn--linea" type="submit">Enviar</button>
      <p class="form__nota">Se abre WhatsApp con tus datos listos para enviar.</p>
    </form>
  </details>
</section>`;
};

// ---------- página de producto ----------
const paginaProducto = (slug, n) => {
  const p = productos[slug];
  const m = mundoDe(slug);
  const otros = m.productos.filter((s) => s !== slug);
  const [principal = { alt: p.nombre }, ...resto] = p.fotos || [];
  const precio = precioTexto(p, `productos.${slug}.precioDesde`);
  const entrega = porConfirmar(p.entrega, `productos.${slug}.entrega`);
  const cuerpo = `<article class="ficha-prod">
  <nav class="migas mono" aria-label="Ruta"><a href="/">Inicio</a> / <a href="/#productos">${esc(m.titulo)}</a> / <span aria-current="page">${esc(p.nombre)}</span></nav>
  <header class="ficha-prod__cab">
    <h1 class="titulo-afiche">${esc(p.nombre)}</h1>
    <p class="ficha-prod__resumen">${esc(p.resumen)}</p>
    <p class="ficha-prod__precio">${precio}</p>
    ${botonWa(esc(textos.botones.producto), `¡Hola Print Home! Quiero cotizar ${p.nombre.toLowerCase()}.`, { producto: slug, origen: 'producto' })}
  </header>
  <figure class="ficha-prod__foto marcas revela">${foto(principal, { eager: true, sizes: '(min-width: 900px) 55vw, 100vw' })}</figure>

  ${barraCmyk(`Orden de producción · ${p.nombre}`)}

  <div class="ficha-prod__cuerpo">
    <section class="orden" aria-labelledby="orden-titulo">
      <header class="orden__cab"><h2 id="orden-titulo" class="mono">Orden de producción</h2><span class="mono">Nº PH-${String(n + 1).padStart(3, '0')}</span></header>
      <dl>
        <div><dt>Producto</dt><dd>${esc(p.nombre)}</dd></div>
        ${p.tamanos?.length ? `<div><dt>Tamaños</dt><dd>${p.tamanos.map(esc).join('<br>')}</dd></div>` : ''}
        ${p.materiales?.length ? `<div><dt>Materiales</dt><dd>${p.materiales.map(esc).join('<br>')}</dd></div>` : ''}
        ${p.acabado ? `<div><dt>Acabado</dt><dd>${esc(p.acabado)}</dd></div>` : ''}
        <div><dt>Entrega</dt><dd>${entrega}</dd></div>
        <div><dt>Precio</dt><dd>${precio}</dd></div>
      </dl>
      <p class="orden__firma">Aprobado por: <span>tu firma acá</span></p>
    </section>
    ${p.usos?.length ? `<section class="usos" aria-labelledby="usos-titulo">
      <h2 id="usos-titulo" class="subtitulo">Se usa en</h2>
      <ul>${p.usos.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
    </section>` : ''}
  </div>

  ${resto.length ? `<div class="ficha-prod__fotos">${resto.map((f) => `<figure class="marcas revela">${foto(f, { sizes: '(min-width: 900px) 45vw, 100vw' })}</figure>`).join('')}</div>` : ''}

  ${otros.length ? `<aside class="relacionados" aria-labelledby="rel-titulo">
    <h2 id="rel-titulo" class="subtitulo">${esc(m.titulo)}, también</h2>
    <ul>${otros.map((s) => `<li><a href="/productos/${s}/">${esc(productos[s].nombre)}</a></li>`).join('')}</ul>
  </aside>` : ''}
</article>`;
  return pagina({
    ruta: `/productos/${slug}/`,
    titulo: `${p.nombre}${negocio.zona ? ` en ${negocio.zona}` : ''} · Print Home`,
    descripcion: `${p.resumen} ${(p.materiales || []).slice(0, 3).join(', ')}. Cotizá por WhatsApp con Print Home.`,
    cuerpo,
    ldExtra: negocio.url
      ? [{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Inicio', item: urlAbs('/') },
            { '@type': 'ListItem', position: 2, name: p.nombre, item: urlAbs(`/productos/${slug}/`) },
          ],
        }]
      : [],
  });
};

// ---------- favicon (versión simplificada del logo) ----------
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#161616"/><circle cx="50" cy="14" r="6" fill="#00A0E3"/><circle cx="54" cy="24" r="4" fill="#E6007E"/><circle cx="44" cy="8" r="3" fill="#FFED00"/><text x="30" y="46" text-anchor="middle" font-family="Brush Script MT, cursive" font-style="italic" font-size="38" fill="#F4F1EA">Ph</text></svg>`;

// ---------- build ----------
await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'productos'), { recursive: true });
await cp(join(raiz, 'public'), dist, { recursive: true });
await cp(join(raiz, 'src', 'estilos.css'), join(dist, 'estilos.css'));
await cp(join(raiz, 'src', 'main.js'), join(dist, 'main.js'));
await writeFile(join(dist, 'img', 'favicon.svg'), favicon);

const portada = pagina({
  ruta: '/',
  titulo: `Print Home · Rótulos, letras corpóreas e impresión${negocio.zona ? ` en ${negocio.zona}` : ''}`,
  descripcion: `Rótulos, letras corpóreas, vinil, volantes, tarjetas y decoración para fiestas${negocio.zona ? ` en ${negocio.zona}` : ''}. Diseñamos, imprimimos e instalamos. Cotizá por WhatsApp.`,
  cuerpo: [hero(), barraCmyk(), seccionProductos(), seccionTrabajos(), seccionComoPedir(), barraCmyk(), seccionFaq(), seccionContacto()].join('\n'),
});
await escribirHtml(join(dist, 'index.html'), portada);

const slugs = catalogo.mundos.flatMap((m) => m.productos);
for (const [n, slug] of slugs.entries()) {
  await mkdir(join(dist, 'productos', slug), { recursive: true });
  await escribirHtml(join(dist, 'productos', slug, 'index.html'), paginaProducto(slug, n));
}

await escribirHtml(join(dist, '404.html'), pagina({
  ruta: '/404.html',
  titulo: 'Página no encontrada · Print Home',
  descripcion: 'Esta página no existe.',
  cuerpo: `<section class="error404"><h1 class="titulo-afiche">Error de <br>registro.</h1><p>Esta página se nos salió del pliego.</p><a class="btn btn--linea" href="/">Volver al inicio</a></section>`,
}));

if (negocio.url) {
  const rutas = ['/', ...slugs.map((s) => `/productos/${s}/`)];
  await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rutas.map((r) => `  <url><loc>${urlAbs(r)}</loc></url>`).join('\n')}\n</urlset>\n`);
  await writeFile(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${urlAbs('/sitemap.xml')}\n`);
} else {
  anotar('negocio.url (dominio: sin esto no hay sitemap ni URL canónica)');
  await writeFile(join(dist, 'robots.txt'), 'User-agent: *\nAllow: /\n');
}
if (!negocio.whatsapp) anotar('negocio.whatsapp (sin número, WhatsApp pide elegir el contacto)');

const fotos = [negocio.hero, antesDespues.antes, antesDespues.despues, ...listaProductos.flatMap((p) => p.fotos || []), ...trabajos];
const fotosPendientes = fotos.filter((f) => !f?.foto).length;
const fotosMuestra = fotos.filter((f) => f?.foto?.includes('images.unsplash.com')).length;

const unicos = [...new Set(pendientes)];
console.log(`✓ Sitio generado en dist/ (${slugs.length + 1} páginas)`);
console.log(`\nFotos: ${fotosMuestra} de muestra (Unsplash) y ${fotosPendientes} sin foto.`);
console.log(`Pendientes del cliente (${unicos.length} datos):`);
for (const p of unicos) console.log('  · ' + p);
