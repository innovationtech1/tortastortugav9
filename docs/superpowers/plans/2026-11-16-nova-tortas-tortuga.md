# NOVA en Tortas Tortuga Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El cliente programa su comida platicando (texto y voz) con NOVA en `ordenar.html` y paga con Cash App.

**Architecture:** La página (GitHub Pages, sin servidor) llama a rutas nuevas del servidor de Studio (Next.js en Netlify), que llevan las fichas, las instrucciones y las claves de Cloudflare. NOVA solo platica y propone; el navegador valida contra Firestore, calcula y guarda.

**Tech Stack:** Vanilla JS + Firestore (tortastortugav9); Next.js + Cloudflare Workers AI (innovationtech-studio, rama `nova-tortas-tortuga`).

**Spec:** `docs/superpowers/specs/2026-11-16-nova-tortas-tortuga-design.md`

## Global Constraints

- NOVA nunca inventa productos, precios ni horarios; el total lo calcula la app (`productos` de Firestore), nunca la IA.
- Mínimo para programar: $60 de productos. Envío: $5. Impuesto: 4% sobre productos + envío. (Constantes en un solo lugar: `NOVA_REGLAS` en `js/nova-pedido.js`.)
- Ninguna clave en la página. Las rutas de Studio solo aceptan el origen `https://innovationtech1.github.io`.
- NOVA no escucha ni habla sin que el cliente toque el botón.
- Si NOVA falla, `ordenar.html` sigue funcionando igual.
- Mientras se valida, NOVA solo aparece con `?nova=1` (bandera `tt_nova` en localStorage).
- Cache-busting: solo referencias locales (`js/…`, `css/…`); nunca tocar URLs de gstatic/firebasejs.

## Review Focus

- Navegador sin reconocimiento de voz (iPhone/Firefox): el botón de voz no aparece y queda el teclado.
- El cliente pide un producto que no existe o una variante ambigua: la app no lo agrega y NOVA pregunta.
- Horario lleno entre la propuesta y la confirmación: `reservarSlot` falla → no se guarda el pedido y se ofrece otro horario.
- Pedido bajo $60: no se programa; se dice cuánto falta.
- Respuesta de la IA sin bloque de pedido o con JSON roto: se muestra solo el texto, sin romper el panel.

---

### Task 1: NOVA aparece y platica por escrito — HECHO (2026-11-16)

- [x] Studio: `lib/nova-tortas.ts` (+ `.test.ts`, `nova-tortas-fichas.json`), `app/api/nova/tortas/route.ts` (CORS, topes, streaming).
- [x] Tortas Tortuga: `js/nova.js`, `css/nova.css`, `img/nova-sello.png`, carga en `ordenar.html`.
- [x] Probado: 8 pruebas de unidad, ruta local (403/204/400/503), panel en navegador de 390 px con servidor simulado.
- [ ] Pendiente de Hector: publicar la rama de Studio en su versión de prueba y probar con IA real en Android.

### Task 2: Voz tipo llamada

**Files:** Create `app/api/nova/tortas/voz/route.ts` (Studio; reutiliza `validarVoz`, voz «estrella», CORS de `origenPermitido`, tope propio) · Modify `js/nova.js`, `css/nova.css`.

**Interfaces:** Produces `POST /api/nova/tortas/voz {text, lang}` → `audio/mpeg`. En `js/nova.js`: `NovaVoz.iniciar()`, `NovaVoz.colgar()`, `NovaVoz.decir(texto)`.

- [ ] Prueba de la ruta: origen malo → 403; texto > 400 letras → 400; sin claves → 503.
- [ ] Botón «Hablar» solo si existe `SpeechRecognition || webkitSpeechRecognition`; ciclo escuchar → enviar → decir → escuchar; cuelga a los 20 s de silencio o con «Colgar».
- [ ] NOVA dice la primera frase en cuanto llega (cortar por `. ? !`), sin esperar la respuesta completa; si la ruta de voz falla, `speechSynthesis`.
- [ ] Sugerencia por inactividad: 45 s con el panel abierto, máximo 1 cada 3 min, nada con `prefers-reduced-motion`.
- [ ] Probar en navegador con servidor simulado; commit.

### Task 3: Programar

**Files:** Create `js/nova-pedido.js` (+ `js/nova-pedido.test.mjs`, funciones puras) · Modify `lib/nova-tortas.ts` y la ruta (aceptan `menu` y `horarios` del navegador, limpios y con tope; la IA termina con una línea `PEDIDO: {json}`) · Modify `js/nova.js`.

**Interfaces:** `extraerPedido(texto) → {texto, pedido|null}` · `validarPedido(pedido, productos, zonas) → {ok, items, faltan[], errores[]}` · `calcularCobro(items) → {subtotal, envio, impuesto, total, faltaParaMinimo}` · `NOVA_REGLAS = {minimo: 60, envio: 5, impuesto: 0.04}`.

- [ ] Pruebas: 5 Original C → subtotal 70, envío 5, impuesto 3.00, total 78.00; subtotal 56 → `faltaParaMinimo` 4 y no se programa; producto inexistente → error; JSON roto → `pedido: null`.
- [ ] Tarjeta de resumen con «Programar» (o «sí» por voz); guardar con los mismos campos de `pages/programar.html` más `itemsData`, `origen: 'NOVA'`, `estadoPago: 'Pago por confirmar'`; `reservarSlot` antes de dar por hecho el horario.
- [ ] Probar el flujo completo en navegador con Firestore simulado; commit.

### Task 4: Pago

**Files:** Modify `js/nova.js` (pantalla de pago: QR + «Abrir Cash App» con `https://cash.app/$CASHTAG/<total>`; QR con una librería local en `js/`) · Modify `pages/admin.html` (etiqueta y botón «Marcar pagado»).

- [ ] NOVA dice «puede pagar aquí» y abre la pantalla de pago con el folio y el total.
- [ ] «Marcar pagado» cambia `estadoPago` a `Pagado`; revisar `firestore.rules` (update de `pedidos` ya está permitido).
- [ ] Falta el $cashtag de Hector: sin él, la pantalla de pago muestra el total y «paga al recibir».
