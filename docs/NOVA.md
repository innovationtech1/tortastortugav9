# NOVA en Tortas Tortuga — guía

NOVA es la asistente que ayuda al cliente a **programar su comida a domicilio** platicando, por escrito o por voz.
Diseño completo: https://claude.ai/artifact/2DsL9xSj6jVcJtj1veDpHk

## Cómo se usa (cliente)

1. En la pantalla de ordenar toca el sello de NOVA (abajo a la derecha).
2. Escribe, usa un atajo, o toca **«Hablar con NOVA»** para platicar por voz como en una llamada.
3. Dile zona, día, hora, qué quieres y tu dirección. Abajo aparece **«Tu pedido»** con el total.
4. Cuando todo está completo aparece el botón **«Programar»** (o di «sí»).
5. NOVA dice **«puede pagar aquí»** y muestra el código QR y el botón de Cash App.

## Reglas que aplica la app

| Regla | Valor | Dónde se cambia |
| --- | --- | --- |
| Mínimo para programar | $60 de productos | `NOVA_REGLAS.minimo` en `js/nova-pedido.js` |
| Envío | $5 | `NOVA_REGLAS.envio` |
| Impuesto | 4% sobre productos + envío | `NOVA_REGLAS.impuesto` |
| Anticipación | 60 minutos | `ANTICIPACION_MIN` en `js/nova.js` |
| Cash App | `$cashtag` del negocio | `CASHTAG` en `js/nova-pedido.js` (vacío = «el pago se hace al recibirlo») |
| Zonas y horarios | los de «Programar orden» | `js/colas-entrega.js` |

El menú y los precios se leen de la app en ese momento. **NOVA nunca decide el total**: lo calcula la app.

## Cómo funciona por dentro

```
Cliente habla o escribe
   → js/nova.js manda la plática + el menú de la app
   → servidor de InnovationTECH Studio (/api/nova/tortas): fichas + IA
   ← NOVA contesta y, en una línea oculta, el pedido como lo entendió
   → js/nova-pedido.js lo revisa contra el menú real y calcula el cobro
   → al confirmar: aparta el horario y guarda el pedido (colección «pedidos», origen «NOVA»)
   → pantalla de pago (Cash App); el pedido queda «Pago por confirmar»
```

- **Voz:** el celular convierte la voz a texto (reconocimiento del navegador). NOVA contesta con su voz
  (`/api/nova/tortas/voz`); si falla, habla la voz del aparato. Si el navegador no reconoce voz, el botón no aparece.
- **Pago:** Cash App no avisa a la app. El pedido aparece en administración como pendiente de cobro y se cobra con el
  botón de cobro de siempre, que lo deja en «Pagado».
- **Fichas:** viven en Studio, archivo `lib/nova-tortas-fichas.json` (27 fichas: negocio, menú, entrega, cobro).
- **Si NOVA falla,** la pantalla de ordenar funciona igual que siempre.

## Archivos

| Archivo | Para qué |
| --- | --- |
| `js/nova.js` | Sello, panel, voz, resumen, programar y pago |
| `js/nova-pedido.js` | Reglas, revisión del pedido y cuentas (con pruebas en `js/nova-pedido.test.mjs`) |
| `css/nova.css` | Estilos |
| `js/vendor/qrcode.js` | Generador de código QR (licencia MIT) |
| Studio: `lib/nova-tortas.ts`, `app/api/nova/tortas/` | Instrucciones, fichas, permisos y topes |

## Encender y apagar

Mientras se prueba, NOVA solo aparece si abres `ordenar.html?nova=1` (se recuerda en ese aparato; `?nova=0` la apaga).
Para encenderla a todos los clientes se quita esa condición al final de `js/nova.js`.

## Pruebas

`node --test js/nova-pedido.test.mjs` (15 pruebas). En Studio: `npm test`.
