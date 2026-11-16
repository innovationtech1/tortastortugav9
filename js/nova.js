// NOVA en Tortas Tortuga — etapa 1: sello flotante y plática por escrito.
// Llama a la entrada de NOVA en el servidor de InnovationTECH Studio (ahí viven las fichas del menú
// y las claves). Cuando exista nova-core (Rust) solo se cambia NOVA_URL.
// Mientras se prueba, solo aparece al abrir la página con ?nova=1 (se recuerda en el aparato; ?nova=0 lo apaga).
(function () {
  'use strict';
  var NOVA_URL = 'https://innovationtech-studio.netlify.app/api/nova/tortas';
  var MAX_MENSAJES = 12;

  var guardar = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var leer = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var q = new URLSearchParams(location.search);
  if (q.get('nova') === '1') guardar('tt_nova', '1');
  if (q.get('nova') === '0') guardar('tt_nova', '0');
  if (leer('tt_nova') !== '1') return;
  var url = leer('tt_nova_url') || NOVA_URL; // para probar contra la versión de prueba de Studio

  var ATAJOS = [
    ['Programar mi comida', 'Quiero programar mi comida a domicilio.'],
    ['Ver menú', '¿Qué tortas tienen y cuánto cuestan?'],
    ['Zonas y horarios', '¿A qué zonas entregan y en qué horarios?'],
    ['¿Cómo pago?', '¿Cómo se paga una orden programada?']
  ];
  var SALUDO = '¡Hola! Soy NOVA. ¿Para qué día quieres tu comida?';
  var historia = []; // {role, content}
  var ocupado = false;

  function el(tag, attrs, texto) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (texto) e.textContent = texto;
    return e;
  }

  var sello = el('button', { id: 'nova-sello', type: 'button', 'aria-label': 'Abrir a NOVA, tu asistente' });
  sello.style.backgroundImage = "url('img/nova-sello.png')";
  var panel = el('section', { id: 'nova-panel', 'aria-label': 'NOVA, asistente de Tortas Tortuga' });
  var cab = el('div', { class: 'nova-cab' });
  cab.appendChild(el('img', { src: 'img/nova-sello.png', alt: '' }));
  var tit = el('div');
  tit.appendChild(el('b', null, 'NOVA'));
  tit.appendChild(el('small', null, 'En línea · tu asistente de Tortas Tortuga'));
  cab.appendChild(tit);
  var cerrar = el('button', { class: 'nova-cerrar', type: 'button', 'aria-label': 'Cerrar' }, '✕');
  cab.appendChild(cerrar);
  var mensajes = el('div', { id: 'nova-mensajes', 'aria-live': 'polite' });
  var atajos = el('div', { id: 'nova-atajos' });
  var form = el('form', { id: 'nova-form' });
  var texto = el('input', { id: 'nova-texto', type: 'text', maxlength: '600', autocomplete: 'off', placeholder: 'Escribe aquí…', 'aria-label': 'Mensaje para NOVA' });
  var enviar = el('button', { id: 'nova-enviar', type: 'submit', 'aria-label': 'Enviar' }, '➤');
  form.appendChild(texto);
  form.appendChild(enviar);
  panel.appendChild(cab);
  panel.appendChild(mensajes);
  panel.appendChild(atajos);
  panel.appendChild(form);

  function burbuja(clase, contenido) {
    var b = el('div', { class: 'nova-msg ' + clase }, contenido);
    mensajes.appendChild(b);
    mensajes.scrollTop = mensajes.scrollHeight;
    return b;
  }

  ATAJOS.forEach(function (a) {
    var b = el('button', { type: 'button' }, a[0]);
    b.addEventListener('click', function () { preguntar(a[1]); });
    atajos.appendChild(b);
  });

  async function preguntar(pregunta) {
    pregunta = (pregunta || '').trim();
    if (!pregunta || ocupado) return;
    ocupado = true;
    enviar.disabled = true;
    atajos.style.display = 'none';
    burbuja('yo', pregunta);
    historia.push({ role: 'user', content: pregunta });
    var b = burbuja('nova', '…');
    var respuesta = '';
    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: historia.slice(-MAX_MENSAJES), lang: (document.documentElement.lang || 'es').slice(0, 2) })
      });
      if (!res.ok) {
        var j = await res.json().catch(function () { return {}; });
        throw new Error(j.error || 'NOVA no pudo contestar.');
      }
      var lector = res.body.getReader();
      var dec = new TextDecoder();
      for (;;) {
        var parte = await lector.read();
        if (parte.done) break;
        respuesta += dec.decode(parte.value, { stream: true });
        b.textContent = respuesta;
        mensajes.scrollTop = mensajes.scrollHeight;
      }
      respuesta = respuesta.trim();
      if (!respuesta) throw new Error('NOVA no pudo contestar.');
      b.textContent = respuesta;
      historia.push({ role: 'assistant', content: respuesta });
    } catch (e) {
      b.remove();
      historia.pop(); // la pregunta sin respuesta no se manda otra vez
      var aviso = e && e.message && !/fetch|network|load/i.test(e.message) ? e.message : 'NOVA no está disponible. Puedes ordenar con el menú de siempre.';
      burbuja('aviso', aviso);
    }
    ocupado = false;
    enviar.disabled = false;
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var t = texto.value;
    texto.value = '';
    preguntar(t);
  });
  sello.addEventListener('click', function () {
    panel.classList.add('abierto');
    sello.style.display = 'none';
    if (!mensajes.childElementCount) burbuja('nova', SALUDO);
  });
  cerrar.addEventListener('click', function () {
    panel.classList.remove('abierto');
    sello.style.display = '';
  });

  function montar() {
    var css = el('link', { rel: 'stylesheet', href: 'css/nova.css?v=1' });
    document.head.appendChild(css);
    document.body.appendChild(sello);
    document.body.appendChild(panel);
  }
  if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);
})();
