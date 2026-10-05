/**
 * pruebas-gas.mjs — Ejecuta gas/Code.gs dentro de un sandbox con un
 * "Google Sheets" falso en memoria y comprueba el CRUD completo, la
 * creación de la estructura y todas las validaciones del servidor.
 *
 * Uso:  node herramientas/pruebas-gas.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// =========================================================================
//  Google Sheets falso
// =========================================================================
class Rango {
  constructor(hoja, fila, col, filas, cols) { Object.assign(this, { hoja, fila, col, filas, cols }); }
  _celda(f, c) { return f * 1000 + c; }                       // clave única
  getValues() {
    const out = [];
    for (let f = 0; f < this.filas; f++) {
      const fila = [];
      for (let c = 0; c < this.cols; c++) fila.push(this.hoja.celda(this.fila + f, this.col + c));
      out.push(fila);
    }
    return out;
  }
  setValues(valores) {
    valores.forEach((fila, f) => fila.forEach((v, c) => this.hoja.escribe(this.fila + f, this.col + c, v)));
    return this;
  }
  getValue() { return this.hoja.celda(this.fila, this.col); }
  setValue(v) { this.hoja.escribe(this.fila, this.col, v); return this; }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
  clearContent() { return this; }
}

class Hoja {
  constructor(nombre) { this.nombre = nombre; this.celdas = new Map(); }
  celda(f, c) { const v = this.celdas.get(f * 1000 + c); return v === undefined ? '' : v; }
  escribe(f, c, v) { this.celdas.set(f * 1000 + c, v); }
  getName() { return this.nombre; }
  getLastRow() {
    let max = 0;
    for (const k of this.celdas.keys()) max = Math.max(max, Math.floor(k / 1000));
    return max;
  }
  getLastColumn() {
    let max = 0;
    for (const k of this.celdas.keys()) max = Math.max(max, k % 1000);
    return max;
  }
  getRange(a, b, c, d) {
    if (typeof a === 'string') return new Rango(this, 1, 1, 1, 1);   // 'F:F' y similares
    return new Rango(this, a, b, c, d);
  }
  appendRow(valores) {
    const f = this.getLastRow() + 1;
    valores.forEach((v, i) => this.escribe(f, i + 1, v));
    return this;
  }
  deleteRow(f) {
    const copia = [...this.celdas.entries()];
    this.celdas.clear();
    for (const [k, v] of copia) {
      const fila = Math.floor(k / 1000), col = k % 1000;
      if (fila < f) this.celdas.set(k, v);
      else if (fila > f) this.celdas.set((fila - 1) * 1000 + col, v);
    }
  }
  setFrozenRows() {} setColumnWidth() {}
}

class Libro {
  constructor() { this.hojas = [new Hoja('Hoja 1')]; }
  getSheetByName(n) { return this.hojas.find(h => h.nombre === n) || null; }
  insertSheet(n) { const h = new Hoja(n); this.hojas.push(h); return h; }
  getSheets() { return this.hojas; }
  getSpreadsheetTimeZone() { return 'America/Mexico_City'; }
  getName() { return 'Mis Finanzas (prueba)'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/FAKE/edit'; }
}

let libro = new Libro();
let ultimoSalida = null;

// Libros "abribles" por ID, como hace SpreadsheetApp.openById().
const LIBROS_POR_ID = new Map([['TU-ID', true], ['1AbC-XyZ_9', true]]);

const gas = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => libro,
    openById: (id) => {
      if (!LIBROS_POR_ID.has(id)) throw new Error('Requested entity was not found: ' + id);
      return libro;
    }
  },
  LockService: {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
  },
  Utilities: {
    getUuid: (() => { let n = 0; return () => `uuid-${++n}`; })(),
    formatDate: (fecha, zona, formato) => {
      const d = new Date(fecha);
      const p = x => String(x).padStart(2, '0');
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
    }
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: t => { ultimoSalida = t; return { setMimeType() { return this; } }; }
  },
  Date, Math, JSON, String, Number, Object, Array, RegExp, Error, isFinite, parseInt
};
gas.globalThis = gas;
vm.createContext(gas);
vm.runInContext(readFileSync(join(RAIZ, 'gas', 'Code.gs'), 'utf8'), gas, { filename: 'Code.gs' });

// =========================================================================
//  Runner
// =========================================================================
let ok = 0, fallos = 0;
const igual = (real, esperado, etiqueta) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ok   ${etiqueta}`); }
  else { fallos++; console.log(`  FALLA ${etiqueta}\n         esperado: ${b}\n         real:     ${a}`); }
};
const cierto = (v, e) => igual(!!v, true, e);
const grupo = t => console.log(`\n${t}`);
const lanza = (fn, etiqueta, fragmento) => {
  try { fn(); fallos++; console.log(`  FALLA ${etiqueta} — NO lanzó error`); }
  catch (e) {
    if (fragmento && !String(e.message).includes(fragmento)) {
      fallos++; console.log(`  FALLA ${etiqueta} — mensaje "${e.message}" no contiene "${fragmento}"`);
    } else { ok++; console.log(`  ok   ${etiqueta} → "${e.message}"`); }
  }
};
/** El objeto de salida falso guarda el JSON serializado en `ultimoSalida`. */
const envolver = obj => { gas.responder(obj); return JSON.parse(ultimoSalida); };
// doPost normaliza la acción a minúsculas; el test replica ese camino.
const post = (accion, cuerpo = {}) =>
  envolver({ ok: true, ...gas.despachar(accion.toLowerCase(), cuerpo) });
const getDatos = () => envolver(gas.leerTodo());

// =========================================================================
grupo('Estructura de la hoja (se crea sola)');
gas.asegurarEstructura();
igual(libro.getSheets().map(h => h.getName()), ['Hoja 1', 'Cuentas', 'Movimientos', 'Categorias'],
  'crea las tres pestañas');
const hdCuentas = libro.getSheetByName('Cuentas').getRange(1, 1, 1, 5).getValues()[0];
igual(hdCuentas, ['ID', 'Nombre', 'Tipo', 'Moneda', 'SaldoInicial'], 'encabezados de Cuentas');
const hdMovs = libro.getSheetByName('Movimientos').getRange(1, 1, 1, 8).getValues()[0];
igual(hdMovs, ['ID', 'Fecha', 'Descripcion', 'Categoria', 'Tipo', 'Monto', 'CuentaId', 'CreadoEn'],
  'encabezados de Movimientos');
igual(libro.getSheetByName('Categorias').getRange(1, 1, 1, 2).getValues()[0], ['ID', 'Nombre'],
  'encabezados de Categorias');
igual(getDatos().categorias.map(c => c.nombre),
  ['Comida', 'Transporte', 'Servicios', 'Salud', 'Ocio', 'Salario', 'Ventas', 'Otros'],
  'siembra las 8 categorías iniciales');
gas.asegurarEstructura();
igual(getDatos().categorias.length, 8, 'no duplica al volver a asegurar la estructura');

// =========================================================================
grupo('Cuentas: crear, leer, editar, eliminar');
const banco = post('crearCuenta', { nombre: 'Banco', tipo: 'banco', moneda: 'MXN', saldoInicial: 1000 }).cuenta;
igual(banco.tipo, 'banco', 'crea la cuenta Banco');
igual(banco.moneda, 'MXN', 'guarda la moneda');
igual(banco.saldoInicial, 1000, 'guarda el saldo inicial');
cierto(!!banco.id, 'asigna un id único');
lanza(() => post('crearCuenta', { nombre: '  ' }), 'nombre obligatorio rechazado', 'obligatorio');
lanza(() => post('crearCuenta', { nombre: 'Banco', tipo: 'banco' }), 'nombre duplicado rechazado', 'Ya existe');
lanza(() => post('crearCuenta', { nombre: 'X', tipo: 'cripto' }), 'tipo inválido rechazado', 'tipo de cuenta inválido');
lanza(() => post('crearCuenta', { nombre: 'X', tipo: 'banco', moneda: 'MX' }), 'moneda inválida rechazada', '3 letras');
const efectivo = post('crearCuenta', { nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: '250.50' }).cuenta;
igual(efectivo.saldoInicial, 250.5, 'saldo inicial con texto numérico');
igual(getDatos().cuentas.length, 2, 'lee las cuentas de la hoja');

const editada = post('actualizarCuenta', { id: banco.id, nombre: 'Banco Principal', tipo: 'digital', moneda: 'USD', saldoInicial: 1500 }).cuenta;
igual([editada.nombre, editada.tipo, editada.moneda, editada.saldoInicial],
  ['Banco Principal', 'digital', 'USD', 1500], 'actualiza todos los campos');
const parcial = post('actualizarCuenta', { id: banco.id, nombre: 'Banco Principal', tipo: 'digital', moneda: 'USD' }).cuenta;
igual(parcial.saldoInicial, 1500, 'si no se manda saldoInicial, conserva el anterior');
lanza(() => post('actualizarCuenta', { id: 'no-existe', nombre: 'X' }), 'editar id inexistente rechazado', 'No se encontró');
igual(post('eliminarCuenta', { id: efectivo.id }).ok, true, 'elimina una cuenta sin movimientos');
lanza(() => post('actualizarCuenta', { id: 'no-existe', nombre: 'X' }), 'editar id inexistente rechazado', 'No se encontró');

// =========================================================================
grupo('Movimientos: crear, leer, editar, eliminar');
const nomina = post('crearMovimiento', {
  fecha: '2026-09-02', descripcion: 'Nómina', categoria: 'Salario',
  tipo: 'ingreso', monto: '5,000.50', cuentaId: banco.id
}).movimiento;
igual(nomina.monto, 5000.5, 'monto con separador de miles y decimal');
igual(nomina.fecha, '2026-09-02', 'fecha normalizada a ISO');
igual(nomina.categoria, 'Salario', 'guarda el nombre de la categoría');
cierto(!!nomina.creadoEn, 'registra CreadoEn');

const compra = post('crearMovimiento', {
  fecha: '2026-09-15', descripcion: 'Supermercado', categoria: 'Comida',
  tipo: 'egreso', monto: 850.25, cuentaId: banco.id
}).movimiento;
igual(compra.tipo, 'egreso', 'movimiento de egreso');

const antesDeValidar = getDatos().movimientos.length;
lanza(() => post('crearMovimiento', { fecha: '2026-09-02', descripcion: 'X', categoria: 'Comida', tipo: 'egreso', monto: 0, cuentaId: banco.id }),
  'monto 0 rechazado', 'mayor que 0');
lanza(() => post('crearMovimiento', { fecha: '2026-09-02', descripcion: 'X', categoria: 'Comida', tipo: 'egreso', monto: -10, cuentaId: banco.id }),
  'monto negativo rechazado', 'mayor que 0');
lanza(() => post('crearMovimiento', { fecha: '2026-09-02', descripcion: 'X', categoria: 'Comida', tipo: 'egreso', monto: 'abc', cuentaId: banco.id }),
  'monto no numérico rechazado', 'mayor que 0');
lanza(() => post('crearMovimiento', { fecha: '2026-02-31', descripcion: 'X', categoria: 'Comida', tipo: 'egreso', monto: 5, cuentaId: banco.id }),
  '31 de febrero rechazado', 'no existe en el calendario');
lanza(() => post('crearMovimiento', { fecha: '2026-09-02', descripcion: '  ', categoria: 'Comida', tipo: 'egreso', monto: 5, cuentaId: banco.id }),
  'descripción vacía rechazada', 'descripción es obligatoria');
lanza(() => post('crearMovimiento', { fecha: '2026-09-02', descripcion: 'X', categoria: 'Comida', tipo: 'transferencia', monto: 5, cuentaId: banco.id }),
  'tipo inválido rechazado', 'tipo de movimiento inválido');
lanza(() => post('crearMovimiento', { fecha: '2026-09-02', descripcion: 'X', categoria: 'Comida', tipo: 'egreso', monto: 5, cuentaId: 'cuenta-fantasma' }),
  'cuenta inexistente rechazada', 'no existe');
lanza(() => post('crearMovimiento', { fecha: '2026-09-02', descripcion: 'X', categoria: '', tipo: 'egreso', monto: 5, cuentaId: banco.id }),
  'categoría vacía rechazada', 'categoría es obligatoria');
igual(getDatos().movimientos.length, antesDeValidar, 'ningún movimiento inválido se escribió');

const creadoAlVuelo = post('crearMovimiento', {
  fecha: '2026-10-01', descripcion: 'Veterinario', categoria: 'Mascotas',
  tipo: 'egreso', monto: 300, cuentaId: banco.id
}).movimiento;
igual(creadoAlVuelo.categoria, 'Mascotas', 'crea el movimiento con categoría nueva');
cierto(getDatos().categorias.some(c => c.nombre === 'Mascotas'), 'da de alta la categoría nueva sola');

const orden = getDatos().movimientos.map(m => m.fecha);
igual(orden, [...orden].sort().reverse(), 'devuelve los movimientos del más reciente al más antiguo');

const mod = post('actualizarMovimiento', { id: compra.id, fecha: '2026-09-16', descripcion: 'Supermercado Plus', categoria: 'Comida', tipo: 'egreso', monto: 900, cuentaId: banco.id }).movimiento;
igual([mod.fecha, mod.descripcion, mod.monto], ['2026-09-16', 'Supermercado Plus', 900], 'actualiza el movimiento');
igual(mod.creadoEn, compra.creadoEn, 'conserva el CreadoEn original');
igual(post('eliminarMovimiento', { id: creadoAlVuelo.id }).ok, true, 'elimina el movimiento');
igual(getDatos().movimientos.length, 2, 'quedan 2 movimientos');
lanza(() => post('eliminarMovimiento', { id: 'no-existe' }), 'eliminar id inexistente rechazado', 'No se encontró');
lanza(() => post('eliminarCuenta', { id: banco.id }), 'eliminar cuenta con movimientos rechazado', 'movimientos asociados');
igual(getDatos().cuentas.length, 1, 'la cuenta protegida sigue existiendo');

// =========================================================================
grupo('Balance calculado como lo hace la app');
const datos = getDatos();
const saldoBanco = datos.cuentas.find(c => c.id === banco.id).saldoInicial
  + datos.movimientos.filter(m => m.cuentaId === banco.id && m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0)
  - datos.movimientos.filter(m => m.cuentaId === banco.id && m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0);
igual(saldoBanco, 5600.5, 'saldo Banco = 1500 + 5000.50 − 900');

// =========================================================================
grupo('Categorías: crear, renombrar (propaga), eliminar');
const nueva = post('crearCategoria', { nombre: 'Educación' }).categoria;
igual(nueva.nombre, 'Educación', 'crea una categoría');
lanza(() => post('crearCategoria', { nombre: 'comida' }), 'duplicado por mayúsculas rechazado', 'Ya existe');
lanza(() => post('crearCategoria', { nombre: '' }), 'categoría vacía rechazada', 'obligatorio');
post('crearMovimiento', { fecha: '2026-10-05', descripcion: 'Curso', categoria: 'Educación', tipo: 'egreso', monto: 200, cuentaId: banco.id });
const renombre = post('actualizarCategoria', { id: nueva.id, nombre: 'Educación y cursos' });
igual(renombre.categoria.nombre, 'Educación y cursos', 'renombra la categoría');
igual(getDatos().movimientos.filter(m => m.categoria === 'Educación y cursos').length, 1,
  'actualiza los movimientos que usaban el nombre anterior');
lanza(() => post('eliminarCategoria', { id: nueva.id }), 'eliminar categoría en uso rechazado', 'que la usan');
post('actualizarMovimiento', { id: getDatos().movimientos.find(m => m.descripcion === 'Curso').id, fecha: '2026-10-05', descripcion: 'Curso', categoria: 'Otros', tipo: 'egreso', monto: 200, cuentaId: banco.id });
igual(post('eliminarCategoria', { id: nueva.id }).ok, true, 'elimina la categoría ya sin uso');
lanza(() => post('actualizarCategoria', { id: 'no-existe', nombre: 'X' }), 'renombrar id inexistente rechazado', 'No se encontró');

// =========================================================================
grupo('Fechas escritas como Date por la hoja');
const hojaMovs = libro.getSheetByName('Movimientos');
hojaMovs.escribe(2, 2, new Date(Date.UTC(2026, 6, 4)));      // 4 de julio de 2026
const releida = getDatos().movimientos.find(m => m.id === compra.id);
igual(releida.fecha, '2026-09-16', 'las fechas en texto se leen tal cual');
igual(gas.aIso(new Date(Date.UTC(2026, 6, 4))), '2026-07-04', 'convierte un Date de la hoja a ISO');
igual(gas.aIso('2026/7/4'), '2026-07-04', 'convierte texto con barras a ISO');
igual(gas.aIso(''), '', 'texto vacío → cadena vacía');

// =========================================================================
grupo('Puntos de entrada HTTP');
const get = accion => { gas.doGet({ parameter: { accion } }); return JSON.parse(ultimoSalida); };
igual(get('salud').ok, true, 'GET ?accion=salud responde');
cierto(!!get('salud').version, 'salud incluye la versión');
const d = get('datos');
igual([d.ok, d.cuentas.length, d.movimientos.length > 0, d.categorias.length > 0],
  [true, 1, true, true], 'GET ?accion=datos devuelve ok:true y las tres colecciones');
igual(get('inventada').ok, false, 'GET con acción desconocida devuelve error');
gas.doPost({ postData: { contents: '{}' } });
igual(JSON.parse(ultimoSalida).ok, false, 'POST sin acción devuelve error');
gas.doPost({
  postData: { contents: JSON.stringify({ accion: 'crearCuenta', nombre: 'Binance', tipo: 'digital', moneda: 'USD', saldoInicial: 50 }) }
});
const postOk = JSON.parse(ultimoSalida);
igual([postOk.ok, postOk.cuenta.nombre], [true, 'Binance'], 'doPost con JSON en el cuerpo');
gas.doPost({ postData: { contents: 'esto no es json' } });
igual(JSON.parse(ultimoSalida).ok, false, 'POST con cuerpo inválido devuelve error, no revienta');
const diag = get('diagnostico');
igual([diag.ok, diag.hojas.length, diag.libro], [true, 4, 'Mis Finanzas (prueba)'],
  'GET ?accion=diagnostico lista las pestañas');

// =========================================================================
grupo('Conexión con la hoja (proyecto independiente vs. script adherido)');
// El sandbox siempre tiene "hoja activa"; para probar el caso independiente
// apagamos ese atajo y comprobamos los dos caminos.
const props = new Map();
gas.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (props.has(k) ? props.get(k) : null),
    setProperty: (k, v) => props.set(k, v)
  })
};
const reiniciar = () => { gas._libro = null; gas.ID_HOJA = ''; props.clear(); };

igual(gas.extraerId('https://docs.google.com/spreadsheets/d/1AbC-XyZ_9/edit#gid=0'), '1AbC-XyZ_9',
  'extrae el ID de una URL completa');
igual(gas.extraerId('1AbC-XyZ_9'), '1AbC-XyZ_9', 'acepta un ID suelto');
igual(gas.extraerId(''), '', 'texto vacío → vacío');
igual(gas.extraerId('   '), '', 'solo espacios → vacío');

// --- Proyecto independiente: sin hoja activa ---
gas.SpreadsheetApp.getActiveSpreadsheet = () => null;
reiniciar();
lanza(() => gas.obtenerLibro(), 'sin hoja activa ni ID da instrucciones claras', 'Extensiones');
lanza(() => gas.obtenerLibro(), 'el mensaje menciona la alternativa con ID_HOJA', 'ID_HOJA');

reiniciar();
gas.ID_HOJA = 'https://docs.google.com/spreadsheets/d/TU-ID/edit';
igual(gas.obtenerLibro().getName(), 'Mis Finanzas (prueba)', 'con ID_HOJA encuentra el libro');
igual(gas.obtenerLibro(), gas.obtenerLibro(), 'el libro se cachea durante la ejecución');

reiniciar();
gas.ID_HOJA = 'NO-EXISTE-ESTE-ID';
lanza(() => gas.obtenerLibro(), 'ID equivocado explica el problema', 'permiso de edición');

// --- conectar() en un proyecto sin diálogo de UI ---
reiniciar();
gas.ID_HOJA = '1AbC-XyZ_9';
gas.SpreadsheetApp.getUi = () => { throw new Error('sin UI en proyecto independiente'); };
const mensaje = gas.conectar();
cierto(mensaje.startsWith('Conectado a:'), `conectar() funciona sin diálogo de UI → "${mensaje}"`);
igual(props.get('SPREADSHEET_ID'), '1AbC-XyZ_9', 'conectar() guarda el ID en las propiedades');
igual(gas.obtenerLibro().getName(), 'Mis Finanzas (prueba)', 'tras conectar() encuentra el libro por ID');

// --- Camino normal: script adherido a la hoja ---
gas.SpreadsheetApp.getUi = undefined;
gas.SpreadsheetApp.getActiveSpreadsheet = () => libro;
reiniciar();
igual(gas.obtenerLibro(), libro, 'si hay hoja activa se usa sin pedir ningún ID');

gas.ID_HOJA = '';
props.clear();
gas.SpreadsheetApp.getActiveSpreadsheet = () => libro;

console.log(`\n${'='.repeat(56)}\n${ok} pruebas correctas, ${fallos} fallo(s)\n${'='.repeat(56)}`);
process.exit(fallos ? 1 : 0);