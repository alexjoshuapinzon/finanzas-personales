/**
 * generar-iconos.mjs
 * ----------------------------------------------------------------------------
 * Crea los iconos PNG de la app (192 y 512 px) sin dependencias externas:
 * dibuja un cuadro redondeado con degradado indigo y una gráfica de barras
 * blanca. Luego codifica los píxeles en PNG usando sólo `zlib` de Node.
 *
 * Uso:  node herramientas/generar-iconos.mjs
 *
 * Los iconos se versionan en el repositorio, así que normalmente no necesitas
 * volver a ejecutar esto salvo que cambies el diseño.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'iconos');

const TAMANOS = [192, 512];

// --- Utilidades de color ---------------------------------------------------
const rgba = (r, g, b, a = 255) => [r, g, b, a];
const mezcla = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const COLORES = {
  inicio: rgba(79, 70, 229),    // #4f46e5
  medio:  rgba(124, 58, 237),   // #7c3aed
  final:  rgba(37, 99, 235),    // #2563eb
  tinta:  rgba(255, 255, 255),
  verde:  rgba(74, 222, 128)
};

// --- Lienzo ----------------------------------------------------------------
function crearLienzo(tam) {
  return { tam, datos: new Uint8Array(tam * tam * 4) };
}

function ponerPixel(li, x, y, color, mezclaAlpha = 1) {
  if (x < 0 || y < 0 || x >= li.tam || y >= li.tam) return;
  const i = (y * li.tam + x) * 4;
  const a = (color[3] / 255) * mezclaAlpha;
  if (a <= 0) return;
  const dst = [li.datos[i], li.datos[i + 1], li.datos[i + 2], li.datos[i + 3]];
  const outA = a + (dst[3] / 255) * (1 - a);
  if (outA === 0) {
    li.datos[i] = li.datos[i + 1] = li.datos[i + 2] = li.datos[i + 3] = 0;
    return;
  }
  for (let c = 0; c < 3; c++) {
    li.datos[i + c] = Math.round(
      (color[c] * a + dst[c] * (dst[3] / 255) * (1 - a)) / outA
    );
  }
  li.datos[i + 3] = Math.round(outA * 255);
}

/** Distancia con signo a un cuadro redondeado (para antialias suave). */
function sdRedondeado(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Rellena una figura usando antialias de 1 px. */
function rellenar(li, sd, color) {
  for (let y = 0; y < li.tam; y++) {
    for (let x = 0; x < li.tam; x++) {
      const d = sd(x + 0.5, y + 0.5);
      const alpha = Math.min(1, Math.max(0, 0.5 - d));
      if (alpha > 0) ponerPixel(li, x, y, color, alpha);
    }
  }
}

// --- Codificación PNG ------------------------------------------------------
const CRC_TABLA = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

function codificarPNG(li) {
  const { tam, datos } = li;

  // Cada scanline lleva un byte de filtro (0 = sin filtro).
  const crudo = Buffer.alloc(tam * (tam * 4 + 1));
  for (let y = 0; y < tam; y++) {
    const base = y * (tam * 4 + 1);
    crudo[base] = 0;
    Buffer.from(datos.buffer, datos.byteOffset + y * tam * 4, tam * 4).copy(crudo, base + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8;   // profundidad de bits
  ihdr[9] = 6;   // color RGBA
  ihdr[10] = 0;  // compresión
  ihdr[11] = 0;  // filtro
  ihdr[12] = 0;  // sin entrelazado

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(crudo, { level: 9 })),
    trozo('IEND', Buffer.alloc(0))
  ]);
}

// --- Diseño del icono ------------------------------------------------------
/**
 * El contenido se mantiene dentro del 62% central para que, cuando Android
 * recorta el icono a círculo ("maskable"), nunca se pierdan las barras.
 */
function dibujar(tam) {
  const li = crearLienzo(tam);
  const u = tam / 512;                      // unidad de escalado (diseño a 512)
  const margen = 30 * u;
  const lado = tam - margen * 2;
  const radioFondo = 110 * u;

  // --- Fondo: cuadro redondeado con degradado diagonal ---
  const sdFondo = (x, y) =>
    sdRedondeado(x, y, tam / 2, tam / 2, lado / 2, lado / 2, radioFondo);
  const grad = (x, y) => {
    const t = Math.min(1, Math.max(0, ((x / tam) + (y / tam)) / 2));
    return t < 0.5
      ? mezcla(COLORES.inicio, COLORES.medio, t * 2)
      : mezcla(COLORES.medio, COLORES.final, (t - 0.5) * 2);
  };

  // Degradado + antialias en una sola pasada.
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const alpha = Math.min(1, Math.max(0, 0.5 - sdFondo(x + 0.5, y + 0.5)));
      if (alpha > 0) ponerPixel(li, x, y, grad(x, y), alpha);
    }
  }

  // --- Gráfica de barras: tres columnas de alturas crecientes ---
  const base = 366 * u;                  // línea del piso de las barras
  const ancho = 74 * u;
  const gap = 36 * u;
  const altoTotal = 208 * u;
  const inicioX = tam / 2 - (ancho * 3 + gap * 2) / 2;
  const alturas = [0.5, 0.75, 1];

  // Línea base primero, para que quede detrás de las barras.
  const grosorBase = 18 * u;
  const anchoBase = ancho * 3 + gap * 2 + 26 * u;
  rellenar(li,
    (x, y) => sdRedondeado(x, y, tam / 2, base + 22 * u, anchoBase / 2, grosorBase / 2, grosorBase / 2),
    mezcla(COLORES.tinta, rgba(0, 0, 0), 0.3)
  );

  for (let i = 0; i < 3; i++) {
    const h = altoTotal * alturas[i];
    const x0 = inicioX + i * (ancho + gap);
    const r = Math.min(ancho / 2, h / 2) * 0.62;
    rellenar(li,
      (x, y) => sdRedondeado(x, y, x0 + ancho / 2, base - h / 2, ancho / 2, h / 2, r),
      COLORES.tinta
    );
  }

  // Punto verde sobre la barra más alta (el "ingreso" que sobresale).
  const cx = inicioX + 2 * (ancho + gap) + ancho / 2;
  const rr = 24 * u;
  rellenar(li, (x, y) => Math.hypot(x - cx, y - (base - altoTotal - 34 * u - rr)) - rr, COLORES.verde);

  return li;
}

// --- Ejecución -------------------------------------------------------------
mkdirSync(SALIDA, { recursive: true });
for (const tam of TAMANOS) {
  const png = codificarPNG(dibujar(tam));
  const archivo = join(SALIDA, `icon-${tam}.png`);
  writeFileSync(archivo, png);
  console.log(`✓ iconos/icon-${tam}.png  (${tam}x${tam}, ${(png.length / 1024).toFixed(1)} KB)`);
}