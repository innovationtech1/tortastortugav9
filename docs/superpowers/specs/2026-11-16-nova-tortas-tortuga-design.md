# NOVA en Tortas Tortuga — diseño

Aprobado por Hector el 2026-11-16. Documento completo: https://claude.ai/artifact/2DsL9xSj6jVcJtj1veDpHk

Resumen: NOVA (la asistente de InnovationTECH Studio) entra a `ordenar.html` para que el cliente programe su comida
hablando o escribiendo. La página llama a `/api/nova/tortas` en el servidor de Studio (rama `nova-tortas-tortuga`
de `innovationtech-studio`), donde viven las fichas del menú y las claves de Cloudflare. NOVA platica y propone;
la app revisa, calcula el total y guarda. Pago: Cash App con código QR y botón; el pedido queda «pago por confirmar».
Cuando exista nova-core (Rust) solo cambia `NOVA_URL` en `js/nova.js`.

Reglas (decididas por Hector salvo nota): programar con $60 o más de productos y envío de $5 (por confirmar contra
la página de inicio, que anuncia $30 + $5 o $60 con envío gratis); impuesto 4% sobre productos + envío; zonas y
horarios de `js/colas-entrega.js`; el total siempre lo calcula la app.
