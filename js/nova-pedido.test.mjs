import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOVA_REGLAS, calcularCobro, enlaceCashApp, esSi, extraerPedido, frasesCompletas, itemsParaCocina, menuCompacto, textoVisible, validarPedido } from './nova-pedido.js';

const productos = [
  { productId: 'original', nombre: '1. Original Torta Tortuga', disponible: true, variantes: [{ label: 'A COMBO TRIPLE MEAT · 9 Slices — $17', precio: 17 }, { label: 'B COMBO DOUBLE MEAT · 6 Slices — $16', precio: 16 }, { label: 'C COMBO SINGLE MEAT · 3 Slices — $14', precio: 14 }] },
  { productId: 'kids', nombre: '7. Kids Tortuga', disponible: true, variantes: [{ label: 'COMBO — $9', precio: 9 }] },
  { productId: 'agotada', nombre: 'Agotada', disponible: false, variantes: [{ label: 'X — $5', precio: 5 }] },
];
const zonas = [{ id: 'converse', nombre: 'Converse' }, { id: '211', nombre: 'Zona 211' }];
const fechas = [{ fecha: '2026-11-21', etiqueta: 'Sáb 21 nov' }];
const horas = ['14:00', '14:30'];
const completo = { zona: 'converse', fecha: '2026-11-21', hora: '14:00', direccion: '123 Main St', items: [{ id: 'original', opcion: 3, cantidad: 5 }] };

test('reglas: mínimo $60, envío $5, impuesto 4%', () => {
  assert.deepEqual(NOVA_REGLAS, { minimo: 60, envio: 5, impuesto: 0.04 });
});

test('calcularCobro: 5 Original sencillas → 70 + 5 + 3.00 = 78.00', () => {
  const v = validarPedido(completo, productos, zonas, fechas, horas);
  assert.deepEqual(calcularCobro(v.renglones), { subtotal: 70, envio: 5, impuesto: 3, total: 78, faltaParaMinimo: 0 });
});

test('calcularCobro: 4 Original sencillas ($56) → faltan $4 para el mínimo', () => {
  const c = calcularCobro([{ precio: 14, cantidad: 4 }]);
  assert.equal(c.subtotal, 56);
  assert.equal(c.faltaParaMinimo, 4);
  assert.equal(c.total, 63.44);
});

test('validarPedido: pedido completo → sin faltantes ni errores, con precio del menú real', () => {
  const v = validarPedido(completo, productos, zonas, fechas, horas);
  assert.deepEqual(v.faltan, []);
  assert.deepEqual(v.errores, []);
  assert.deepEqual(v.renglones, [{ productId: 'original', opcion: 3, nombre: '1. Original Torta Tortuga (C COMBO SINGLE MEAT · 3 Slices)', precio: 14, cantidad: 5 }]);
  assert.equal(v.zona.id, 'converse');
});

test('validarPedido: la IA no puede poner precio ni producto inventado o agotado', () => {
  const v = validarPedido({ items: [{ id: 'original', opcion: 3, cantidad: 1, precio: 1 }, { id: 'pizza', opcion: 1, cantidad: 2 }, { id: 'agotada', opcion: 1, cantidad: 1 }] }, productos, zonas, fechas, horas);
  assert.equal(v.renglones.length, 1);
  assert.equal(v.renglones[0].precio, 14);
  assert.equal(v.errores.length, 2);
});

test('validarPedido: opción ambigua → pregunta; producto de una sola opción no la necesita', () => {
  const v = validarPedido({ items: [{ id: 'original', cantidad: 2 }, { id: 'kids', cantidad: 2 }] }, productos, zonas, fechas, horas);
  assert.deepEqual(v.renglones.map((r) => r.productId), ['kids']);
  assert.match(v.errores[0], /opción/);
});

test('validarPedido: zona por nombre, y zona/día/hora fuera de lista → error y faltante', () => {
  assert.equal(validarPedido({ zona: 'Zona 211' }, productos, zonas, fechas, horas).zona.id, '211');
  const v = validarPedido({ zona: 'austin', fecha: '2026-11-22', hora: '21:00', items: [] }, productos, zonas, fechas, horas);
  assert.deepEqual(v.faltan, ['productos', 'zona', 'día', 'hora', 'dirección']);
  assert.equal(v.errores.length, 3);
});

test('validarPedido: basura y cantidades absurdas no rompen nada', () => {
  for (const x of [null, 5, 'hola', [], { items: 'x' }, { items: [null, 3, {}] }]) assert.ok(Array.isArray(validarPedido(x, productos, zonas, fechas, horas).renglones));
  const v = validarPedido({ items: [{ id: 'kids', cantidad: 9999 }, { id: 'kids', cantidad: -3 }, { id: 'kids', cantidad: 60 }] }, productos, zonas, fechas, horas);
  assert.deepEqual(v.renglones.map((r) => r.cantidad), [50, 1]);
  assert.match(v.errores[0], /210-TORTA-10/);
});

test('extraerPedido: separa el texto de la línea PEDIDO; JSON roto o ausente → null', () => {
  const r = extraerPedido('Claro, cinco tortas.\nPEDIDO: {"items":[{"id":"original","opcion":3,"cantidad":5}],"zona":null}');
  assert.equal(r.texto, 'Claro, cinco tortas.');
  assert.equal(r.pedido.items[0].cantidad, 5);
  assert.deepEqual(extraerPedido('Hola.'), { texto: 'Hola.', pedido: null });
  assert.deepEqual(extraerPedido('Hola.\nPEDIDO: {"items":[{'), { texto: 'Hola.', pedido: null });
  assert.deepEqual(extraerPedido('Hola.\nPEDIDO: [1,2]'), { texto: 'Hola.', pedido: null });
});

test('textoVisible: nunca enseña la línea del pedido, ni a medias', () => {
  assert.equal(textoVisible('Claro.\nPEDI'), 'Claro.\nPEDI');
  assert.equal(textoVisible('Claro.\nPEDIDO: {"it'), 'Claro.');
});

test('itemsParaCocina: un renglón por producto, con la forma que usa cocina', () => {
  const items = itemsParaCocina([{ nombre: 'Kids (COMBO)', precio: 9, cantidad: 2 }], 'Ana');
  assert.deepEqual(items, [{ nombre: 'Kids (COMBO)', precio: 9, modificaciones: [], cuenta: 'Ana' }, { nombre: 'Kids (COMBO)', precio: 9, modificaciones: [], cuenta: 'Ana' }]);
});

test('menuCompacto: id, nombre y opciones numeradas; sin agotados', () => {
  const m = menuCompacto(productos);
  assert.ok(m.includes('original | 1. Original Torta Tortuga | 1) A COMBO TRIPLE MEAT · 9 Slices $17; 2)'));
  assert.ok(m.includes('kids | 7. Kids Tortuga | 1) COMBO $9'));
  assert.ok(!m.includes('agotada'));
});

test('enlaceCashApp: con $cashtag y total; sin cashtag o con uno raro → null', () => {
  assert.equal(enlaceCashApp('$TortasTortuga', 78), 'https://cash.app/$TortasTortuga/78.00');
  assert.equal(enlaceCashApp('TortasTortuga', 63.44), 'https://cash.app/$TortasTortuga/63.44');
  for (const t of ['', null, 'a/b', 'x y', '<script>']) assert.equal(enlaceCashApp(t, 10), null);
  assert.equal(enlaceCashApp('ok', 0), null);
});

test('esSi: confirma solo con un sí corto y claro', () => {
  for (const t of ['sí', 'Si', 'sí, prográmalo', 'claro', 'dale', 'ok', 'yes']) assert.ok(esSi(t), t);
  for (const t of ['no', 'siete tortas', 'sin cebolla', 'vale la pena?', '', 'sí pero mejor cambia la hora a las tres y agrega dos kids más']) assert.ok(!esSi(t), t);
});

test('frasesCompletas: entrega solo frases terminadas y avanza el marcador', () => {
  assert.deepEqual(frasesCompletas('Hola. ¿Qué vas', 0), { frases: 'Hola.', hasta: 5 });
  assert.deepEqual(frasesCompletas('Hola. ¿Qué vas', 5), { frases: '', hasta: 5 });
  assert.deepEqual(frasesCompletas('Cuesta $9.50 la', 0), { frases: '', hasta: 0 });
});
