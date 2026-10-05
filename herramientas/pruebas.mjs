/**
 * pruebas.mjs — Ejecuta el JavaScript real de index.html dentro de un
 * sandbox (sin navegador) y comprueba la lógica de cálculo, formato,
 * validación y agrupación. Uso:  node herramientas/pruebas.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
const codigo = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\ninit\(\);\s*$/, '\n');

// --- stubs mínimos del navegador ------------------------------------------
const almacen = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem: k => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: k => almacen.delete(k)
  },
  document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
  navigator: {},
  location: { protocol: 'http:', host: 'localhost:4173' },
  setTimeout, clearTimeout, Promise, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, isFinite, RegExp, Error
};
sandbox.window = { matchMedia: () => ({ addEventListener() {} }) };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// Las declaraciones `const` no se vuelven propiedades del objeto global,
// así que exponemos a mano todo lo que queremos poder probar.
vm.runInContext(codigo + `
;globalThis.__api = {
  estado, CONFIG, NOMBRE_TIPO,
  parseMonto, fmtMoneda, redondear, colorDe,
  saldoDeCuenta, balanceTotal, totalesDe, filtrarMovimientos,
  agruparPorMes, egresosPorCategoria,
  normalizarMovimiento, normalizarCuenta,
  esc, filaMovimiento, tarjetaCuenta, nombreCuenta
};`, sandbox, { filename: 'index.html#inline' });

// --- miniature test runner -------------------------------------------------
let ok = 0, fallos = 0;
const igual = (real, esperado, etiqueta) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ok   ${etiqueta}`); }
  else { fallos++; console.log(`  FALLA ${etiqueta}\n         esperado: ${b}\n         real:     ${a}`); }
};
const cierto = (v, etiqueta) => igual(!!v, true, etiqueta);
const grupo = t => console.log(`\n${t}`);

const { parseMonto, fmtMoneda, redondear, estado, colorDe, NOMBRE_TIPO } = sandbox.__api;

// =========================================================================
grupo('parseMonto — acepta formatos de español y de inglés');
[
  ['1234.56', 1234.56], ['1,234.56', 1234.56], ['1234,56', 1234.56],
  ['$1,250.50', 1250.5], ['0.01', 0.01], ['12,5', 12.5],
  ['1,234', 1234], ['  99  ', 99]
].forEach(([entrada, esperado]) => igual(parseMonto(entrada), esperado, `"${entrada}" → ${esperado}`));
igual(Number.isNaN(parseMonto('abc')), true, '"abc" → NaN');
igual(Number.isNaN(parseMonto('')), true, '"" → NaN');

// =========================================================================
grupo('fmtMoneda — separador de miles y 2 decimales');
const simbolo = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(1234.5);
igual(fmtMoneda(1234.5), simbolo, '1234.50 formatea como moneda local');
cierto(/[.,]\d{2}$/.test(fmtMoneda(99)), 'incluye 2 decimales');
igual(redondear(0.1 + 0.2), 0.3, 'redondear corrige coma flotante');

// =========================================================================
grupo('colorDe — mismo nombre ⇒ mismo color');
igual(colorDe('Comida'), colorDe('Comida'), 'es estable');
igual(colorDe('Comida') === colorDe('Transporte'), false, 'nombres distintos ⇒ color distinto');
cierto(/^hsl\(\d+ 62% 48%\)$/.test(colorDe('Ocio')), 'formato hsl válido');

// =========================================================================
grupo('Estado de prueba: 2 cuentas + movimientos');
estado.cuentas = [
  { id: 'c1', nombre: 'Banco', tipo: 'banco', moneda: 'MXN', saldoInicial: 1000 },
  { id: 'c2', nombre: 'Efectivo', tipo: 'efectivo', moneda: 'MXN', saldoInicial: 200 }
];
estado.categorias = [{ id: 'k1', nombre: 'Comida' }, { id: 'k2', nombre: 'Salario' }];
estado.movimientos = [
  { id: 'm1', fecha: '2026-09-02', descripcion: 'Nómina', categoria: 'Salario', tipo: 'ingreso', monto: 5000, cuentaId: 'c1', creadoEn: '2026-09-02T10:00:00Z' },
  { id: 'm2', fecha: '2026-09-15', descripcion: 'Supermercado', categoria: 'Comida', tipo: 'egreso', monto: 850.25, cuentaId: 'c1', creadoEn: '2026-09-15T10:00:00Z' },
  { id: 'm3', fecha: '2026-10-01', descripcion: 'Cena', categoria: 'Comida', tipo: 'egreso', monto: 120, cuentaId: 'c2', creadoEn: '2026-10-01T10:00:00Z' },
  { id: 'm4', fecha: '2026-10-05', descripcion: 'Freelance', categoria: 'Salario', tipo: 'ingreso', monto: 300, cuentaId: 'c2', creadoEn: '2026-10-05T10:00:00Z' }
];

igual(sandbox.__api.saldoDeCuenta('c1'), 5149.75, 'saldo Banco = 1000 + 5000 − 850.25');
igual(sandbox.__api.saldoDeCuenta('c2'), 380, 'saldo Efectivo = 200 − 120 + 300');
igual(sandbox.__api.balanceTotal(), 5529.75, 'balance total = suma de ambas cuentas');
igual(sandbox.__api.saldoDeCuenta('no-existe'), 0, 'cuenta inexistente → 0');

const totales = sandbox.__api.totalesDe(estado.movimientos);
igual(totales, { ingresos: 5300, egresos: 970.25, balance: 4329.75, cantidad: 4 }, 'totales históricos');

// =========================================================================
grupo('Filtrado de movimientos');
const f = estado.filtros;
Object.assign(f, { desde: '', hasta: '', categoria: '', tipo: '', cuenta: '', buscar: '' });
igual(sandbox.__api.filtrarMovimientos().length, 4, 'sin filtros devuelve todo');
Object.assign(f, { desde: '2026-10-01' });
igual(sandbox.__api.filtrarMovimientos().length, 2, 'filtro por fecha desde');
Object.assign(f, { desde: '', tipo: 'egreso' });
igual(sandbox.__api.filtrarMovimientos().length, 2, 'filtro por tipo egreso');
Object.assign(f, { tipo: '', categoria: 'Comida' });
igual(sandbox.__api.filtrarMovimientos().length, 2, 'filtro por categoría');
Object.assign(f, { categoria: '', buscar: 'free' });
igual(sandbox.__api.filtrarMovimientos().length, 1, 'búsqueda de texto insensible a mayúsculas');
Object.assign(f, { buscar: '', cuenta: 'c2' });
igual(sandbox.__api.filtrarMovimientos().length, 2, 'filtro por cuenta');
Object.assign(f, { cuenta: '', desde: '2026-11-01' });
igual(sandbox.__api.filtrarMovimientos().length, 0, 'rango sin coincidencias');
Object.assign(f, { desde: '' });

// =========================================================================
grupo('Agrupación por mes (gráfica de barras)');
const porMes = sandbox.__api.agruparPorMes(estado.movimientos, '2026-08-01', '2026-11-30');
igual(porMes.map(p => p.clave), ['2026-08', '2026-09', '2026-10', '2026-11'],
  'incluye meses vacíos para que la gráfica no tenga huecos');
igual(porMes.map(p => p.ingresos), [0, 5000, 300, 0], 'ingresos por mes');
igual(porMes.map(p => p.egresos), [0, 850.25, 120, 0], 'egresos por mes');
igual(sandbox.__api.agruparPorMes(estado.movimientos, '', '').length, 2, 'sin rango ⇒ sólo meses con datos');

// =========================================================================
grupo('Egresos por categoría (gráfica circular)');
const partes = sandbox.__api.egresosPorCategoria(estado.movimientos, '2026-01-01', '2026-12-31');
igual(partes.length, 1, 'sólo una categoría tiene egresos (Salario es ingreso)');
igual(partes[0].nombre, 'Comida', 'ordenadas de mayor a menor');
igual(partes[0].valor, 970.25, 'total de Comida');
igual(Math.round(partes[0].porcentaje), 100, 'el 100% del gasto');
igual(sandbox.__api.egresosPorCategoria(estado.movimientos, '2026-01-01', '2026-09-30')[0].valor, 850.25,
  'respeta el rango de fechas');
igual(sandbox.__api.egresosPorCategoria([], '', '').length, 0, 'sin movimientos ⇒ sin porciones');

// =========================================================================
grupo('Normalización de datos que llegan de la hoja');
const n = sandbox.__api.normalizarMovimiento;
igual(n({ monto: '-120.5', tipo: 'otro' }), { id: '', fecha: '', descripcion: '', categoria: 'Otros', tipo: 'egreso', monto: 120.5, cuentaId: '', creadoEn: '' },
  'monto negativo → positivo, tipo inválido → egreso, ids ausentes → vacío');
igual(n({ id: 'x', fecha: '2026-01-05T10:00:00.000Z', categoria: 'Comida', tipo: 'ingreso', monto: '40', cuentaId: 'c1' }).fecha,
  '2026-01-05', 'recorta el timestamp ISO a fecha');
igual(sandbox.__api.normalizarCuenta({ id: 'a', nombre: 'X', tipo: 'desconocido' }).tipo, 'otro',
  'tipo de cuenta desconocido → otro');
igual(sandbox.__api.normalizarCuenta({ id: 'a', nombre: 'X', moneda: 'usd' }).moneda, 'USD', 'moneda en mayúsculas');

// =========================================================================
grupo('Configuración compartida entre frontend y backend');
igual(sandbox.__api.NOMBRE_TIPO.digital, 'Billetera digital', 'etiqueta legible de billetera digital');
const gas = readFileSync(join(RAIZ, 'gas', 'Code.gs'), 'utf8');
const catsDelGas = gas.match(/CATEGORIAS_INICIALES:\s*\[([^\]]+)\]/)[1]
  .split(',').map(s => s.trim().replace(/^'|'$/g, ''));
igual(catsDelGas, ['Comida','Transporte','Servicios','Salud','Ocio','Salario','Ventas','Otros'],
  'categorías por defecto del script de Apps Script');

// =========================================================================
// =========================================================================
grupo('Renderizado: los datos del usuario se escapan (evita XSS)');
const { esc, filaMovimiento, tarjetaCuenta, nombreCuenta } = sandbox.__api;
const malware = '<img src=x onerror=alert(1)>';
igual(esc(malware), '&lt;img src=x onerror=alert(1)&gt;', 'esc() escapa < y >');
igual(esc('a & b'), 'a &amp; b', 'esc() escapa &');
igual(esc(`" '${malware}`), '&quot; &#39;&lt;img src=x onerror=alert(1)&gt;', 'esc() escapa comillas');

const fila = filaMovimiento({
  id: 'x1', fecha: '2026-09-15', descripcion: malware, categoria: 'Comida',
  tipo: 'egreso', monto: 850.25, cuentaId: 'c1', creadoEn: ''
});
igual(fila.includes(malware), false, 'la celda de descripción NO contiene HTML crudo');
cierto(fila.includes('&lt;img'), 'la descripción aparece escapada en la tabla');
cierto(fila.includes('15/09/2026'), 'la fecha se muestra en formato español');
cierto(fila.includes('−'), 'el egreso se muestra con signo menos');
cierto(/class="num negativo"/.test(fila), 'el egreso se pinta en rojo');
igual(filaMovimiento({ id: 'x2', fecha: '2026-09-15', descripcion: 'Nómina', categoria: 'Salario', tipo: 'ingreso', monto: 100, cuentaId: 'c1' }).includes('class="num positivo"'),
  true, 'el ingreso se pinta en verde');

const tarjeta = tarjetaCuenta({ id: 'c1', nombre: malware, tipo: 'banco', moneda: 'MXN', saldoInicial: 1000 });
igual(tarjeta.includes(malware), false, 'la tarjeta de cuenta NO contiene HTML crudo');
cierto(tarjeta.includes('data-editar-cuenta="c1"'), 'la tarjeta trae el botón de editar');
igual(nombreCuenta('c1'), 'Banco', 'nombreCuenta resuelve el id correcto');
igual(nombreCuenta('borrada'), 'Cuenta eliminada', 'cuenta borrada se etiqueta, no se rompe');

console.log(`\n${'='.repeat(56)}\n${ok} pruebas correctas, ${fallos} fallo(s)\n${'='.repeat(56)}`);
process.exit(fallos ? 1 : 0);