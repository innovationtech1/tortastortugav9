// NOVA en Tortas Tortuga — las cuentas y revisiones del pedido (sin pantalla ni red, para poder probarlas).
// NOVA platica y propone; aquí la app revisa contra el menú real y calcula el cobro. El total nunca lo decide la IA.

// Reglas del negocio para una orden programada con NOVA (un solo lugar para cambiarlas).
export const NOVA_REGLAS = { minimo: 60, envio: 5, impuesto: 0.04 };

// El $cashtag de Cash App del negocio, sin el signo $. Vacío = todavía no hay pago con QR.
export const CASHTAG = '';

const dinero = (n) => Math.round(n * 100) / 100;
const sinPrecio = (label) => String(label || '').replace(/\s*—\s*\$[\d.]+\s*$/, '').trim();
const unaLinea = (t, max) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, max);

// El menú en renglones cortos para mandárselo a NOVA: «id | nombre | 1) opción $precio; 2) …»
export function menuCompacto(productos) {
  return (productos || [])
    .filter((p) => p && p.productId && p.disponible !== false && Array.isArray(p.variantes) && p.variantes.length)
    .slice(0, 60)
    .map((p) => `${p.productId} | ${unaLinea(p.nombre, 60)} | ` +
      p.variantes.slice(0, 10).map((v, i) => `${i + 1}) ${unaLinea(sinPrecio(v.label), 60)} $${v.precio}`).join('; '))
    .join('\n');
}

// Separa lo que NOVA le dice al cliente de la línea final «PEDIDO: {json}». JSON roto o ausente → pedido null.
export function extraerPedido(respuesta) {
  const t = String(respuesta || '');
  const i = t.lastIndexOf('PEDIDO:');
  if (i < 0) return { texto: t.trim(), pedido: null };
  const texto = t.slice(0, i).trim();
  const resto = t.slice(i + 7);
  const a = resto.indexOf('{');
  const b = resto.lastIndexOf('}');
  if (a < 0 || b <= a) return { texto, pedido: null };
  try {
    const p = JSON.parse(resto.slice(a, b + 1));
    return { texto, pedido: p && typeof p === 'object' && !Array.isArray(p) ? p : null };
  } catch (e) {
    return { texto, pedido: null };
  }
}

// Lo que se le enseña al cliente mientras la respuesta va llegando (sin la línea del pedido).
export function textoVisible(parcial) {
  const t = String(parcial || '');
  const i = t.indexOf('PEDIDO');
  return (i < 0 ? t : t.slice(0, i)).trim();
}

// Revisa lo que entendió NOVA contra el menú, las zonas, los días y las horas reales.
// Devuelve lo que sí vale (renglones con precio real), lo que falta y lo que no se pudo usar.
export function validarPedido(pedido, productos, zonas, fechas, horas) {
  const p = pedido && typeof pedido === 'object' ? pedido : {};
  const errores = [];
  const renglones = [];
  let unidades = 0;
  for (const it of Array.isArray(p.items) ? p.items.slice(0, 30) : []) {
    const prod = (productos || []).find((x) => x && x.productId === (it && it.id) && x.disponible !== false);
    if (!prod) { errores.push(`No encontré «${unaLinea(it && it.id, 40)}» en el menú.`); continue; }
    const vars = prod.variantes || [];
    const n = vars.length === 1 ? 1 : Number(it.opcion);
    const v = Number.isInteger(n) ? vars[n - 1] : null;
    if (!v) { errores.push(`¿Qué opción de ${prod.nombre} quieres?`); continue; }
    const cantidad = Math.min(50, Math.max(1, Math.floor(Number(it.cantidad)) || 1));
    if (unidades + cantidad > 100) { errores.push('Para pedidos de más de 100 productos llama al 210-TORTA-10.'); break; }
    unidades += cantidad;
    renglones.push({ productId: prod.productId, opcion: n, nombre: `${prod.nombre} (${sinPrecio(v.label)})`, precio: Number(v.precio) || 0, cantidad });
  }
  const z = (zonas || []).find((x) => x.id === p.zona || String(x.nombre).toLowerCase() === String(p.zona || '').toLowerCase());
  const f = (fechas || []).find((x) => x.fecha === p.fecha);
  const hora = (horas || []).includes(p.hora) ? p.hora : null;
  if (p.zona && !z) errores.push('No entregamos en esa zona.');
  if (p.fecha && !f) errores.push('Ese día no se puede programar (domingo cerrado; máximo una semana adelante).');
  if (p.hora && !hora) errores.push('Las entregas son cada 30 minutos, de 10:00 AM a 5:30 PM.');
  const direccion = unaLinea(p.direccion, 160) || null;
  const faltan = [];
  if (!renglones.length) faltan.push('productos');
  if (!z) faltan.push('zona');
  if (!f) faltan.push('día');
  if (!hora) faltan.push('hora');
  if (!direccion) faltan.push('dirección');
  return { renglones, zona: z || null, fecha: f || null, hora, direccion, faltan, errores };
}

// El cobro de una orden programada: productos + envío fijo + impuesto sobre los dos.
export function calcularCobro(renglones) {
  const subtotal = dinero((renglones || []).reduce((s, r) => s + r.precio * r.cantidad, 0));
  const envio = NOVA_REGLAS.envio;
  const impuesto = dinero((subtotal + envio) * NOVA_REGLAS.impuesto);
  return { subtotal, envio, impuesto, total: dinero(subtotal + envio + impuesto), faltaParaMinimo: dinero(Math.max(0, NOVA_REGLAS.minimo - subtotal)) };
}

// Los renglones como los espera cocina: un producto por línea.
export function itemsParaCocina(renglones, cuenta) {
  const items = [];
  for (const r of renglones || []) for (let i = 0; i < r.cantidad; i++) items.push({ nombre: r.nombre, precio: r.precio, modificaciones: [], cuenta });
  return items;
}

// Enlace de pago de Cash App con el total ya puesto (null si todavía no hay $cashtag).
export function enlaceCashApp(cashtag, total) {
  const tag = String(cashtag || '').replace(/^\$/, '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(tag) || !(total > 0)) return null;
  return `https://cash.app/$${tag}/${Number(total).toFixed(2)}`;
}

// ¿El cliente dijo que sí? (para confirmar el resumen por voz sin gastar IA)
export function esSi(texto) {
  return /^\s*(s[ií]+|simon|simón|claro|dale|va|ok|okay|adelante|correcto|as[ií] es|progr[aá]malo|yes|yeah|sure)(?![\p{L}\d])/iu.test(String(texto || '')) && String(texto).trim().length <= 40;
}

// Saca del texto que va llegando las frases ya completas, para que NOVA empiece a hablar sin esperar el final.
export function frasesCompletas(texto, desde) {
  const t = String(texto || '').slice(desde || 0);
  const m = t.match(/^[\s\S]*[.!?…](?=\s|$)/);
  if (!m) return { frases: '', hasta: desde || 0 };
  return { frases: m[0].trim(), hasta: (desde || 0) + m[0].length };
}
