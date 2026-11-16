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

### Task 2: Voz tipo llamada — HECHO (2026-11-16), falta probar en Android

- [x] Studio: `app/api/nova/tortas/voz/route.ts` (voz «estrella», CORS, tope 1 cada 0.7 s y 250 pedidos / 40 000 letras al día).
- [x] `js/nova.js`: botón «Hablar con NOVA» / «Colgar» solo si hay `SpeechRecognition`; ciclo escuchar → enviar → decir → escuchar; cuelga a los 20 s de silencio; dice la primera frase sin esperar el final; respaldo `speechSynthesis`.
- [x] Sugerencia por inactividad (45 s, máximo 1 cada 3 min); las animaciones respetan `prefers-reduced-motion`.
- [ ] No probado con micrófono ni audio reales (el navegador de pruebas no tiene): validar en Android.

### Task 3: Programar — HECHO (2026-11-16)

- [x] `js/nova-pedido.js` + 15 pruebas; Studio acepta `contexto` (menú, zonas, días, horas) y pide la línea `PEDIDO:` (10 pruebas).
- [x] Resumen «Tu pedido», mínimo, horario libre (con 60 min de anticipación), nombre y teléfono, «Programar» o «sí».
- [x] Aparta el horario antes de guardar; si falla el guardado, lo libera. Probado en navegador con base de datos simulada.
- [ ] No probado con la IA real: falta ver qué tan bien arma la línea `PEDIDO:` el modelo.

### Task 4: Pago — HECHO salvo el $cashtag

- [x] Pantalla de pago con QR (`js/vendor/qrcode.js`) y botón «Abrir Cash App»; sin `CASHTAG` dice «el pago se hace al recibirlo».
- [x] Administración: no hizo falta botón nuevo; `pages/admin.html` ya trata todo lo que no es «Pagado» como pendiente y su cobro lo marca «Pagado». Falta confirmarlo en el aparato.
- [ ] Poner el `$cashtag` de Hector en `CASHTAG`.

### Pendiente antes de encender a todos los clientes

- [ ] Publicar la rama `nova-tortas-tortuga` de Studio en su versión de prueba y probar con IA y voz reales.
- [ ] Confirmar la regla ($60 + $5) contra la página de inicio y corregir `index.html` (anuncia $30/$60 y productos que ya no se venden).
- [ ] Quitar la bandera `?nova=1`.
