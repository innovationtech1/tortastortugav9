// NOVA en Tortas Tortuga: sello flotante, plática por escrito y por voz (tipo llamada), resumen del pedido,
// programar la orden y pantalla de pago con Cash App.
// NOVA platica y propone (servidor de InnovationTECH Studio, donde viven las fichas y las claves);
// esta página revisa contra el menú real, calcula el cobro y guarda. Cuando exista nova-core (Rust) solo cambia NOVA_URL.
// Mientras se prueba, solo aparece al abrir la página con ?nova=1 (se recuerda en el aparato; ?nova=0 lo apaga).
import {
  CASHTAG, NOVA_REGLAS, calcularCobro, enlaceCashApp, esSi, extraerPedido, frasesCompletas,
  itemsParaCocina, menuCompacto, textoVisible, validarPedido,
} from './nova-pedido.js';

// Por ahora apunta a la versión de PRUEBA de Studio (rama «pruebas»). Al pasar NOVA al sitio principal de
// Studio se cambia a https://innovationtech-studio.netlify.app/api/nova/tortas
const NOVA_URL = 'https://pruebas--innovationtech-studio.netlify.app/api/nova/tortas';
const FIRESTORE = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
const MAX_MENSAJES = 12;
const SILENCIO_MS = 20000;       // la llamada se cuelga sola tras 20 s sin oír nada
const INACTIVO_MS = 45000;       // sugerencia tras 45 s sin actividad…
const ENTRE_SUGERENCIAS_MS = 180000; // …máximo una cada 3 minutos
const ANTICIPACION_MIN = 60;     // se programa con al menos 60 minutos de anticipación

const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const leer = (k) => { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } };
const q = new URLSearchParams(location.search);
if (q.get('nova') === '1') guardar('tt_nova', '1');
if (q.get('nova') === '0') guardar('tt_nova', '0');

const ATAJOS = [
  ['Programar mi comida', 'Quiero programar mi comida a domicilio.'],
  ['Ver menú', '¿Qué tortas tienen y cuánto cuestan?'],
  ['Zonas y horarios', '¿A qué zonas entregan y en qué horarios?'],
  ['¿Cómo pago?', '¿Cómo se paga una orden programada?'],
];
const SUGERENCIAS = [
  'Dime tu zona, el día y la hora, y te aparto el horario.',
  'Todos los combos incluyen soda en lata y papas. ¿Cuál torta se te antoja?',
  'Puedo programar tu comida para hoy o hasta una semana adelante.',
  'Si es para varios, dime cuántas tortas de cada una y yo armo el pedido.',
];
const SALUDO = '¡Hola! Soy NOVA. ¿Para qué día quieres tu comida?';
const $ = (n) => '$' + Number(n).toFixed(2);

function el(tag, attrs, texto) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (texto != null) e.textContent = texto;
  return e;
}

function iniciar() {
  const url = leer('tt_nova_url') || NOVA_URL; // para probar contra la versión de prueba de Studio
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const historia = [];
  let ocupado = false;
  let datos = null;        // { productos, zonas, fechas, horas, colas, fs, db, contexto } — se carga al abrir
  let pedido = null;       // lo último que validó la app
  let horarioLibre = false;
  let listoAntes = false;
  let pagado = false;      // ya se programó: se muestra el pago
  let ultimaActividad = Date.now();
  let ultimaSugerencia = 0;
  let sugerencia = 0;

  // ---------- Pantalla ----------
  const sello = el('button', { id: 'nova-sello', type: 'button', 'aria-label': 'Abrir a NOVA, tu asistente' });
  sello.style.backgroundImage = "url('img/nova-sello.png')";
  const panel = el('section', { id: 'nova-panel', 'aria-label': 'NOVA, asistente de Tortas Tortuga' });
  const cab = el('div', { class: 'nova-cab' });
  const cara = el('img', { src: 'img/nova-sello.png', alt: '' });
  const tit = el('div');
  tit.append(el('b', null, 'NOVA'), el('small', null, 'En línea · tu asistente de Tortas Tortuga'));
  const cerrar = el('button', { class: 'nova-cerrar', type: 'button', 'aria-label': 'Cerrar' }, '✕');
  cab.append(cara, tit, cerrar);
  const mensajes = el('div', { id: 'nova-mensajes', 'aria-live': 'polite' });
  const atajos = el('div', { id: 'nova-atajos' });
  const resumen = el('div', { id: 'nova-resumen', hidden: '' });
  const voz = el('button', { id: 'nova-voz', type: 'button' }, '🎤 Hablar con NOVA');
  const form = el('form', { id: 'nova-form' });
  const texto = el('input', { id: 'nova-texto', type: 'text', maxlength: '600', autocomplete: 'off', placeholder: 'Escribe aquí…', 'aria-label': 'Mensaje para NOVA' });
  const enviar = el('button', { id: 'nova-enviar', type: 'submit', 'aria-label': 'Enviar' }, '➤');
  form.append(texto, enviar);
  panel.append(cab, mensajes, atajos, resumen);
  if (SR) panel.append(voz);
  panel.append(form);

  function burbuja(clase, contenido) {
    const b = el('div', { class: 'nova-msg ' + clase }, contenido);
    mensajes.appendChild(b);
    mensajes.scrollTop = mensajes.scrollHeight;
    return b;
  }
  const actividad = () => { ultimaActividad = Date.now(); };

  ATAJOS.forEach(([nombre, pregunta]) => {
    const b = el('button', { type: 'button' }, nombre);
    b.addEventListener('click', () => preguntar(pregunta));
    atajos.appendChild(b);
  });

  // ---------- Lo que la app sabe (menú, zonas, días, horas) ----------
  // Se carga aparte: si falla, NOVA sigue contestando dudas con sus fichas, solo que sin programar.
  async function cargarDatos() {
    try {
      const [menu, colas, fs, cfg] = await Promise.all([import('./menu.js'), import('./colas-entrega.js'), import(FIRESTORE), import('./firebase-config.js')]);
      const productos = await menu.getProductos();
      const zonas = colas.CONFIG_COLAS.zonas;
      const fechas = colas.fechasDisponibles(7);
      const horas = colas.generarHorarios();
      const contexto = {
        menu: menuCompacto(productos),
        zonas: zonas.map((z) => `${z.id} = ${z.nombre}`).join('; '),
        fechas: fechas.map((f) => `${f.fecha} = ${f.etiqueta}`).join('; '),
        horas: `cada 30 minutos, de ${horas[0]} a ${horas[horas.length - 1]}`,
      };
      if (contexto.menu) datos = { productos, zonas, fechas, horas, colas, fs, db: cfg.db, contexto };
    } catch (e) {
      datos = null;
    }
  }

  // ---------- Plática ----------
  async function preguntar(pregunta) {
    pregunta = (pregunta || '').trim();
    if (!pregunta || ocupado) return;
    ocupado = true;
    actividad();
    enviar.disabled = true;
    atajos.style.display = 'none';
    burbuja('yo', pregunta);
    historia.push({ role: 'user', content: pregunta });
    const b = burbuja('nova', '…');
    cara.classList.add('nova-respira');
    let respuesta = '';
    let dicho = 0;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: historia.slice(-MAX_MENSAJES), lang: (document.documentElement.lang || 'es').slice(0, 2), contexto: datos ? datos.contexto : null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'NOVA no pudo contestar.');
      }
      const lector = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const parte = await lector.read();
        if (parte.done) break;
        respuesta += dec.decode(parte.value, { stream: true });
        const visible = textoVisible(respuesta);
        b.textContent = visible || '…';
        mensajes.scrollTop = mensajes.scrollHeight;
        if (llamada && !respuesta.includes('PEDIDO')) { // habla la primera frase sin esperar el final
          const f = frasesCompletas(visible, dicho);
          if (f.frases) { decir(f.frases); dicho = f.hasta; }
        }
      }
      const r = extraerPedido(respuesta);
      if (!r.texto) throw new Error('NOVA no pudo contestar.');
      b.textContent = r.texto;
      historia.push({ role: 'assistant', content: r.texto });
      if (llamada) decir(r.texto.slice(dicho));
      if (r.pedido && datos && !pagado) await revisarPedido(r.pedido);
    } catch (e) {
      b.remove();
      historia.pop(); // la pregunta sin respuesta no se manda otra vez
      const aviso = e && e.message && !/fetch|network|load/i.test(e.message) ? e.message : 'NOVA no está disponible. Puedes ordenar con el menú de siempre.';
      burbuja('aviso', aviso);
      if (llamada) decir(aviso);
    }
    cara.classList.remove('nova-respira');
    ocupado = false;
    enviar.disabled = false;
    actividad();
    if (llamada) seguirLlamada();
  }

  // ---------- Resumen del pedido (lo revisa y lo calcula la app) ----------
  function anticipacionOk(fecha, hora) {
    const [h, m] = hora.split(':').map(Number);
    const [a, me, d] = fecha.split('-').map(Number);
    return new Date(a, me - 1, d, h, m).getTime() - Date.now() >= ANTICIPACION_MIN * 60000;
  }

  async function revisarPedido(crudo) {
    const v = validarPedido(crudo, datos.productos, datos.zonas, datos.fechas, datos.horas);
    horarioLibre = false;
    const avisos = v.errores.slice();
    if (v.zona && v.fecha && v.hora) {
      try {
        const libres = (await datos.colas.consultarDisponibilidad(v.zona.id, v.fecha.fecha)).filter((s) => s.disponible && anticipacionOk(v.fecha.fecha, s.hora));
        horarioLibre = libres.some((s) => s.hora === v.hora);
        if (!horarioLibre) {
          avisos.push(libres.length ? `Ese horario ya no está libre. Libres ese día: ${libres.slice(0, 6).map((s) => s.etiqueta).join(', ')}.` : 'Ese día ya no tiene horarios libres. Elige otro día.');
        }
      } catch (e) {
        avisos.push('No pude revisar los horarios. Intenta de nuevo.');
      }
    }
    pedido = v;
    pintarResumen(avisos);
    const c = calcularCobro(v.renglones);
    const listo = !v.faltan.length && horarioLibre && c.faltaParaMinimo === 0;
    if (listo && !listoAntes) {
      const frase = `Tu pedido: subtotal ${$(c.subtotal)}, envío ${$(c.envio)}, impuesto ${$(c.impuesto)}, total ${$(c.total)}. ¿Lo programo?`;
      burbuja('nova', frase);
      if (llamada) decir(`Subtotal ${c.subtotal} dólares, envío ${c.envio}, impuesto ${c.impuesto}, total ${c.total} dólares. ¿Lo programo?`);
    } else if (!listo && llamada && avisos.length) {
      decir(avisos[0]);
    }
    listoAntes = listo;
  }

  function renglon(a, b, clase) {
    const r = el('div', { class: 'nova-ren' + (clase ? ' ' + clase : '') });
    r.append(el('span', null, a), el('span', null, b));
    return r;
  }

  function pintarResumen(avisos) {
    const v = pedido;
    resumen.replaceChildren();
    if (!v || (!v.renglones.length && !v.zona && !v.fecha && !v.hora)) { resumen.hidden = true; return; }
    resumen.hidden = false;
    const c = calcularCobro(v.renglones);
    resumen.append(el('b', { class: 'nova-res-tit' }, 'Tu pedido'));
    v.renglones.forEach((r) => resumen.append(renglon(`${r.cantidad} × ${r.nombre}`, $(r.precio * r.cantidad))));
    const cuando = [v.zona && v.zona.nombre, v.fecha && v.fecha.etiqueta, v.hora && datos.colas.horaBonita(v.hora)].filter(Boolean).join(' · ');
    if (cuando) resumen.append(el('div', { class: 'nova-cuando' }, '📍 ' + cuando));
    if (v.direccion) resumen.append(el('div', { class: 'nova-cuando' }, '🏠 ' + v.direccion));
    if (v.renglones.length) {
      resumen.append(renglon('Subtotal', $(c.subtotal)), renglon('Envío', $(c.envio)), renglon('Impuesto (4%)', $(c.impuesto)), renglon('Total', $(c.total), 'nova-total'));
    }
    if (v.renglones.length && c.faltaParaMinimo > 0) avisos.push(`Para programar el mínimo es ${$(NOVA_REGLAS.minimo)} en productos. Te faltan ${$(c.faltaParaMinimo)}.`);
    if (v.faltan.length) avisos.push('Falta: ' + v.faltan.join(', ') + '.');
    avisos.forEach((a) => resumen.append(el('div', { class: 'nova-falta' }, a)));
    const listo = !v.faltan.length && horarioLibre && c.faltaParaMinimo === 0;
    if (listo) {
      const nombre = el('input', { id: 'nova-nombre', type: 'text', maxlength: '60', placeholder: 'Tu nombre', autocomplete: 'name', 'aria-label': 'Tu nombre' });
      const tel = el('input', { id: 'nova-tel', type: 'tel', maxlength: '20', placeholder: 'Tu teléfono', autocomplete: 'tel', 'aria-label': 'Tu teléfono' });
      nombre.value = leer('tt_cliente_nombre') || '';
      tel.value = leer('tt_cliente_telefono') || '';
      const boton = el('button', { id: 'nova-programar', type: 'button' }, `Programar · ${$(c.total)}`);
      boton.addEventListener('click', programar);
      resumen.append(nombre, tel, boton);
    }
  }

  // ---------- Programar (guarda el pedido y aparta el horario) ----------
  async function programar() {
    const v = pedido;
    const boton = document.getElementById('nova-programar');
    const nombre = (document.getElementById('nova-nombre') || {}).value || '';
    const telefono = (document.getElementById('nova-tel') || {}).value || '';
    if (!v || !boton || boton.disabled) return;
    if (!nombre.trim()) {
      burbuja('nova', '¿A nombre de quién va el pedido? Escríbelo en «Tu nombre».');
      if (llamada) decir('¿A nombre de quién va el pedido? Escríbelo en la pantalla.');
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Programando…';
    const { fs, db, colas } = datos;
    const c = calcularCobro(v.renglones);
    const items = itemsParaCocina(v.renglones, nombre.trim());
    const etiqueta = v.fecha.etiqueta + ' · ' + colas.horaBonita(v.hora);
    const folio = Date.now() % 100000;
    const folioStr = '#' + String(folio).slice(-4);
    const ref = fs.doc(fs.collection(db, 'pedidos'));
    try {
      // Primero se aparta el horario (atómico): si alguien ganó el último lugar, no se guarda nada.
      const apartado = await colas.reservarSlot(v.zona.id, v.hora, ref.id, v.fecha.fecha);
      if (!apartado || !apartado.ok) {
        listoAntes = false;
        await revisarPedido({ zona: v.zona.id, fecha: v.fecha.fecha, hora: v.hora, direccion: v.direccion, items: v.renglones.map((r) => ({ id: r.productId, cantidad: r.cantidad, opcion: r.opcion })) });
        return;
      }
      try {
        await fs.setDoc(ref, {
          cliente: nombre.trim(), nombre: nombre.trim(), telefono: telefono.trim(),
          clienteUid: leer('tt_cliente_uid') || null,
          tipoEntrega: 'Domicilio', tipoServicio: 'Orden programada', esOrdenProgramada: true, origen: 'NOVA',
          zonaEntrega: v.zona.id, zonaEntregaNombre: v.zona.nombre,
          fechaEntrega: v.fecha.fecha, horaEntrega: v.hora, horarioEntrega: v.hora,
          horarioAgendado: etiqueta, horarioEntregaEtiqueta: etiqueta,
          direccionReferencia: v.direccion,
          itemsData: items,
          items: items.map((i) => `${i.nombre} - $${i.precio.toFixed(2)}`).join(' | '),
          total: $(c.total), totalNum: c.total, cargoServicio: c.envio,
          desglose: { subtotal: c.subtotal, descuento: 0, impuesto: c.impuesto, impuestoTasa: NOVA_REGLAS.impuesto, propina: 0, envio: c.envio, total: c.total },
          estado: 'Programado 🗓️', estadoPago: 'Pago por confirmar',
          folio, folioStr, programadoPor: 'NOVA', archivado: false,
          creado: fs.serverTimestamp(), tomadaEn: new Date().toISOString(), tiempos: { recibida: Date.now() },
        });
      } catch (e) {
        await colas.liberarSlot(v.zona.id, v.hora, ref.id, v.fecha.fecha).catch(() => {});
        throw e;
      }
      guardar('tt_cliente_nombre', nombre.trim());
      if (telefono.trim()) guardar('tt_cliente_telefono', telefono.trim());
      pagado = true;
      pintarPago(c.total, folioStr, etiqueta);
      const comoPagar = enlaceCashApp(CASHTAG, c.total) ? 'Puede pagar aquí.' : 'El pago se hace al recibirlo.';
      burbuja('nova', `Listo, tu pedido es el ${folioStr}, para ${etiqueta}. ${comoPagar}`);
      if (llamada) decir(`Listo, tu pedido quedó programado. ${comoPagar}`);
    } catch (e) {
      boton.disabled = false;
      boton.textContent = `Programar · ${$(c.total)}`;
      burbuja('aviso', 'No se pudo programar. Revisa tu conexión e intenta de nuevo.');
    }
  }
  // ---------- Pago: «puede pagar aquí» ----------
  function pintarPago(total, folioStr, etiqueta) {
    resumen.replaceChildren();
    resumen.classList.add('nova-pago');
    resumen.hidden = false;
    resumen.append(el('b', { class: 'nova-res-tit' }, enlaceCashApp(CASHTAG, total) ? 'Puede pagar aquí' : 'Pedido programado'), renglon(`Pedido ${folioStr} · ${etiqueta}`, ''), renglon('Total', $(total), 'nova-total'));
    const enlace = enlaceCashApp(CASHTAG, total);
    if (!enlace) {
      resumen.append(el('div', { class: 'nova-cuando' }, 'Tu pedido quedó programado. El pago se hace al recibirlo.'));
      return;
    }
    const qr = el('div', { id: 'nova-qr', role: 'img', 'aria-label': 'Código QR de Cash App' });
    const abrir = el('a', { id: 'nova-cashapp', href: enlace, target: '_blank', rel: 'noopener' }, `Abrir Cash App · ${$(total)}`);
    resumen.append(qr, abrir, el('div', { class: 'nova-cuando' }, `Escribe ${folioStr} en la nota del pago. Lo marcamos como pagado en cuanto lo veamos.`));
    const s = el('script', { src: 'js/vendor/qrcode.js' });
    s.onload = () => {
      try {
        const code = window.qrcode(0, 'M');
        code.addData(enlace);
        code.make();
        qr.innerHTML = code.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      } catch (e) { qr.remove(); }
    };
    s.onerror = () => qr.remove();
    document.head.appendChild(s);
  }

  // ---------- Voz: botón tipo llamada ----------
  let llamada = false;
  let rec = null;
  let escuchando = false;
  let hablando = false;
  const cola = [];
  let audio = null;

  function trozos(t) { // partes de ≤ 400 letras, cortando en frases
    const partes = [];
    let actual = '';
    for (const f of String(t).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/)) {
      if (!f) continue;
      if ((actual + ' ' + f).trim().length <= 380) actual = (actual + ' ' + f).trim();
      else { if (actual) partes.push(actual); actual = f.slice(0, 380); }
    }
    if (actual) partes.push(actual);
    return partes;
  }

  function decir(t) {
    trozos(t).forEach((p) => cola.push(p));
    if (!hablando) siguienteAudio();
  }

  async function siguienteAudio() {
    const t = cola.shift();
    if (!t || !llamada) { hablando = false; cola.length = 0; if (llamada) seguirLlamada(); return; }
    hablando = true;
    pararEscucha();
    cara.classList.add('nova-respira');
    const fin = () => { cara.classList.remove('nova-respira'); siguienteAudio(); };
    try {
      const res = await fetch(url + '/voz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t, lang: 'es' }) });
      if (!res.ok) throw new Error('voz');
      const src = URL.createObjectURL(await res.blob());
      audio = new Audio(src);
      audio.onended = audio.onerror = () => { URL.revokeObjectURL(src); audio = null; fin(); };
      await audio.play();
    } catch (e) { // sin la voz de NOVA: la voz del aparato
      if (!('speechSynthesis' in window) || !llamada) return fin();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'es-US';
      u.onend = u.onerror = fin;
      window.speechSynthesis.speak(u);
    }
  }

  function callar() {
    cola.length = 0;
    if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    hablando = false;
    cara.classList.remove('nova-respira');
  }

  function pararEscucha() {
    escuchando = false;
    if (rec) { rec.onend = rec.onresult = rec.onerror = null; try { rec.abort(); } catch (e) {} rec = null; }
    voz.classList.remove('nova-oyendo');
  }

  function escuchar() {
    if (!llamada || escuchando || hablando || ocupado) return;
    let oido = false;
    rec = new SR();
    rec.lang = 'es-US';
    rec.interimResults = true;
    rec.onresult = (ev) => {
      actividad();
      const r = ev.results[ev.results.length - 1];
      texto.value = r[0].transcript;
      if (r.isFinal) {
        oido = true;
        const dicho = r[0].transcript.trim();
        texto.value = '';
        pararEscucha();
        if (!dicho) return seguirLlamada();
        if (esSi(dicho) && document.getElementById('nova-programar')) { burbuja('yo', dicho); programar().then(seguirLlamada); } else preguntar(dicho);
      }
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        colgar();
        burbuja('aviso', 'Necesito permiso para usar el micrófono. Puedes escribirme aquí abajo.');
      }
    };
    rec.onend = () => { escuchando = false; voz.classList.remove('nova-oyendo'); if (!oido) seguirLlamada(); };
    try { rec.start(); escuchando = true; voz.classList.add('nova-oyendo'); } catch (e) { escuchando = false; }
  }

  function seguirLlamada() {
    if (!llamada || hablando || ocupado || escuchando) return;
    if (Date.now() - ultimaActividad > SILENCIO_MS) { colgar(); burbuja('nova', 'Colgué por el silencio. Toca «Hablar con NOVA» cuando quieras seguir.'); return; }
    setTimeout(escuchar, 250);
  }

  function colgar() {
    llamada = false;
    pararEscucha();
    callar();
    voz.textContent = '🎤 Hablar con NOVA';
    voz.classList.remove('nova-en-llamada');
  }

  voz.addEventListener('click', () => {
    if (llamada) return colgar();
    llamada = true;
    actividad();
    voz.textContent = '⏹ Colgar';
    voz.classList.add('nova-en-llamada');
    if (historia.length) escuchar(); else decir(SALUDO); // al terminar de saludar empieza a escuchar
  });

  // ---------- Sugerencias cuando el cliente se queda inactivo ----------
  setInterval(() => {
    const ahora = Date.now();
    if (!panel.classList.contains('abierto') || ocupado || llamada || pagado || document.hidden) return;
    if (ahora - ultimaActividad < INACTIVO_MS || ahora - ultimaSugerencia < ENTRE_SUGERENCIAS_MS) return;
    ultimaSugerencia = ahora;
    burbuja('nova sugerencia', SUGERENCIAS[sugerencia++ % SUGERENCIAS.length]);
    cara.classList.add('nova-late');
    setTimeout(() => cara.classList.remove('nova-late'), 2400);
  }, 5000);

  // ---------- Abrir y cerrar ----------
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const t = texto.value;
    texto.value = '';
    if (esSi(t) && document.getElementById('nova-programar')) { burbuja('yo', t); programar(); } else preguntar(t);
  });
  texto.addEventListener('input', actividad);
  sello.addEventListener('click', () => {
    panel.classList.add('abierto');
    sello.style.display = 'none';
    actividad();
    if (!mensajes.childElementCount) { burbuja('nova', SALUDO); cargarDatos(); }
  });
  cerrar.addEventListener('click', () => {
    colgar();
    panel.classList.remove('abierto');
    sello.style.display = '';
  });

  document.head.appendChild(el('link', { rel: 'stylesheet', href: 'css/nova.css?v=2' }));
  document.body.append(sello, panel);
}

if ((() => { try { return localStorage.getItem('tt_nova') === '1'; } catch (e) { return false; } })()) {
  if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);
}
