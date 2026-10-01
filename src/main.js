// Print Home · interacciones. Todo es mejora progresiva: sin JS el sitio se lee y los enlaces funcionan.
document.documentElement.classList.add('js');

const reducirMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Medición: cada clic a WhatsApp o a llamar, con el producto ----------
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-track]');
  if (!a) return;
  const evento = a.dataset.track === 'llamar' ? 'clic_llamar' : 'clic_whatsapp';
  const datos = { producto: a.dataset.producto || 'general', origen: a.dataset.origen || '' };
  (window.dataLayer = window.dataLayer || []).push({ event: evento, ...datos });
  if (typeof window.gtag === 'function') window.gtag('event', evento, datos);
  if (typeof window.plausible === 'function') window.plausible(evento, { props: datos });
});

// ---------- Menú móvil ----------
const menuBtn = document.querySelector('.menu-btn');
const menu = document.getElementById('menu');
if (menuBtn && menu) {
  const cerrar = () => { menu.classList.remove('abierto'); menuBtn.setAttribute('aria-expanded', 'false'); };
  menuBtn.addEventListener('click', () => {
    const abierto = menu.classList.toggle('abierto');
    menuBtn.setAttribute('aria-expanded', String(abierto));
  });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) cerrar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('abierto')) { cerrar(); menuBtn.focus(); } });
}

// ---------- Fotos que entran con registro desfasado ----------
const revelables = document.querySelectorAll('.revela');
if (reducirMovimiento || !('IntersectionObserver' in window)) {
  revelables.forEach((el) => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver((entradas) => {
    for (const en of entradas) if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  revelables.forEach((el) => io.observe(el));
}

// ---------- Contador (solo existe si el dato es real) ----------
document.querySelectorAll('[data-contador]').forEach((el) => {
  if (reducirMovimiento) return;
  const fin = Number(el.dataset.contador);
  const fmt = new Intl.NumberFormat('es-CR');
  const io = new IntersectionObserver(([en]) => {
    if (!en.isIntersecting) return;
    io.disconnect();
    const t0 = performance.now();
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / 1400);
      el.textContent = fmt.format(Math.round(fin * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
  io.observe(el);
});

// ---------- Antes / después ----------
document.querySelectorAll('.ad__marco').forEach((marco) => {
  const control = marco.querySelector('.ad__control');
  const mover = () => marco.style.setProperty('--pos', control.value + '%');
  control.addEventListener('input', mover);
  mover();
});

// ---------- Filtros de la galería ----------
const filtros = document.querySelectorAll('[data-filtro]');
filtros.forEach((btn) => btn.addEventListener('click', () => {
  const f = btn.dataset.filtro;
  filtros.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  document.querySelectorAll('.galeria__item').forEach((it) => { it.hidden = f !== 'todos' && it.dataset.mundo !== f; });
}));

// ---------- Visor ampliado con ficha ----------
const caja = document.querySelector('.caja');
if (caja) {
  const cajaFoto = caja.querySelector('.caja__foto');
  const cajaFicha = caja.querySelector('.caja__ficha');
  const fila = (k, v) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.append(v); return [dt, dd]; };
  document.querySelectorAll('.galeria__btn').forEach((btn) => btn.addEventListener('click', () => {
    const d = btn.dataset;
    cajaFoto.replaceChildren(btn.firstElementChild.cloneNode(true));
    const enlace = document.createElement('a');
    enlace.href = d.url; enlace.textContent = d.producto;
    const filas = [fila('Producto', enlace), fila('Material', d.material)];
    if (d.cliente) filas.push(fila('Cliente', d.cliente));
    cajaFicha.replaceChildren(...filas.flat());
    caja.showModal();
  }));
  caja.addEventListener('click', (e) => { if (e.target === caja) caja.close(); });
}

// ---------- Formulario secundario: arma el mensaje y abre WhatsApp ----------
document.querySelectorAll('[data-form-wa]').forEach((form) => form.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(form);
  const wa = document.querySelector('a[data-track="whatsapp"]');
  const base = new URL(wa ? wa.href : 'https://wa.me/');
  base.searchParams.set('text', `¡Hola Print Home! Soy ${f.get('nombre')} (${f.get('contacto')}). ${f.get('mensaje')}`);
  (window.dataLayer = window.dataLayer || []).push({ event: 'clic_whatsapp', producto: 'general', origen: 'formulario' });
  window.open(base.toString(), '_blank', 'noopener');
}));
