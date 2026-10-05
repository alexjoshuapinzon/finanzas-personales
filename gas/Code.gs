/**
 * ============================================================================
 *  FINANZAS PERSONALES — API REST sobre Google Sheets
 *  Google Apps Script · Web App (doGet + doPost)
 * ----------------------------------------------------------------------------
 *  PESTAÑAS DEL LIBRO (se crean solas si no existen):
 *    Cuentas     : ID | Nombre | Tipo | Moneda | SaldoInicial
 *    Movimientos : ID | Fecha | Descripcion | Categoria | Tipo | Monto | CuentaId | CreadoEn
 *    Categorias  : ID | Nombre
 *
 *  IMPORTANTE
 *  - La columna "Fecha" se guarda como TEXTO en formato "YYYY-MM-DD"
 *    (formato/plain). Así no hay desfases de zona horaria al leerla.
 *  - La columna "Categoria" guarda el NOMBRE de la categoría, no su id,
 *    para que la hoja siga siendo legible asimple vista.
 *  - "CreadoEn" es una columna extra (ISO 8601) que permite ordenar de forma
 *    estable los movimientos que comparten la misma fecha.
 *
 *  SEGURIDAD
 *  Esta API no pide contraseña: está pensada para uso personal. Cualquiera
 *  que tenga la URL puede leer y escribir en tu hoja. Ver la nota final
 *  del README sobre cómo limitarla.
 * ============================================================================
 */

/** @OnlyCurrentDoc */
var CONFIG = {
  HOJA_CUENTAS: 'Cuentas',
  HOJA_MOVIMIENTOS: 'Movimientos',
  HOJA_CATEGORIAS: 'Categorias',

  ENCABEZADOS: {
    Cuentas: ['ID', 'Nombre', 'Tipo', 'Moneda', 'SaldoInicial'],
    Movimientos: ['ID', 'Fecha', 'Descripcion', 'Categoria', 'Tipo', 'Monto', 'CuentaId', 'CreadoEn'],
    Categorias: ['ID', 'Nombre']
  },

  CATEGORIAS_INICIALES: [
    'Comida', 'Transporte', 'Servicios', 'Salud', 'Ocio', 'Salario', 'Ventas', 'Otros'
  ],

  TIPOS_CUENTA: ['efectivo', 'banco', 'digital', 'otro'],
  TIPOS_MOVIMIENTO: ['ingreso', 'egreso'],

  // Tope de seguridad para no devolver una respuesta enormousemente grande.
  // Si necesitas más, sube este número.
  MAX_MOVIMIENTOS: 5000,

  VERSION: '1.1.0'
};

/**
 * ID del libro con el que trabaja este script.
 *
 * - Si el script se creó DESDE la hoja (Extensiones → Apps Script), esta
 *   constante se ignora: se usa la hoja activa.
 * - Si lo creaste como proyecto independiente (script.google.com → Nuevo
 *   proyecto), pega aquí el ID o la URL de tu hoja. También puedes ejecutar
 *   una sola vez la función `conectar()` y el ID queda guardado.
 *
 * El ID está en la URL, entre "/d/" y "/edit":
 *   https://docs.google.com/spreadsheets/d/1AbC...XyZ/edit   ← ID = 1AbC...XyZ
 */
var ID_HOJA = '';

var _libro = null;   // caché por ejecución


/**
 * Devuelve el libro de trabajo, o lanza un error que explica qué hacer.
 *
 * `SpreadsheetApp.getActiveSpreadsheet()` devuelve null cuando el script es un
 * proyecto independiente; de ahí el fallback al ID guardado.
 */
function obtenerLibro() {
  if (_libro) return _libro;

  var activo = null;
  try { activo = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { activo = null; }
  if (activo) { _libro = activo; return _libro; }

  var id = properties().getProperty('SPREADSHEET_ID') || extraerId(ID_HOJA);
  if (!id) {
    throw new Error(
      'No se encontró la hoja de cálculo. Elige una de estas dos opciones:\n' +
      '(1) La recomendada: en Google Sheets abre Extensiones → Apps Script y pega este ' +
      'código en el script que ya está adherido a tu hoja.\n' +
      '(2) O pega el ID de tu hoja en la constante ID_HOJA (arriba del todo en este ' +
      'archivo) y vuelve a publicar el Web App.'
    );
  }

  try {
    _libro = SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error(
      'No se pudo abrir la hoja con el ID "' + id + '". Revisa que el ID esté completo ' +
      'y que tu cuenta tenga permiso de edición sobre ella. Detalle: ' + mensajeDeError(e)
    );
  }
  return _libro;
}

/**
 * Ejecuta esto UNA VEZ para conectar el script con tu hoja si lo creaste como
 * proyecto independiente. El ID queda guardado en las propiedades del script.
 *
 * En el editor de Apps Script: elige la función "conectar" en la lista de
 * arriba y pulsa Ejecutar.
 */
function conectar() {
  var entrada = String(ID_HOJA || '').trim();

  try {
    var ui = SpreadsheetApp.getUi();
    if (ui) {
      var r = ui.prompt(
        'Conectar con tu hoja',
        'Pega el ID o la URL de tu Google Sheet:',
        ui.ButtonSet.OK_CANCEL
      );
      if (r.getSelectedButton() !== ui.Button.OK) return 'Cancelado.';
      entrada = String(r.getResponseText() || '').trim();
    }
  } catch (e) {
    // Proyecto independiente: no hay diálogo, se usa ID_HOJA.
  }

  var id = extraerId(entrada);
  if (!id) return 'No se recibió un ID válido. Pega el ID o la URL de tu hoja.';

  properties().setProperty('SPREADSHEET_ID', id);
  _libro = null;
  asegurarEstructura();

  return 'Conectado a: ' + obtenerLibro().getName() + ' — ' + obtenerLibro().getUrl();
}

function properties() {
  return PropertiesService.getScriptProperties();
}

/** Acepta un ID suelto o una URL completa de Google Sheets y devuelve el ID. */
function extraerId(texto) {
  var t = String(texto || '').trim();
  if (!t) return '';
  var m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/);
  return m ? m[1] : t;
}


// ============================================================================
//  PUNTOS DE ENTRADA
// ============================================================================

/** GET ?accion=datos | salud | diagnostico */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var accion = String(params.accion || 'datos').toLowerCase();

    if (accion === 'salud' || accion === 'ping') {
      return responder({
        ok: true,
        accion: 'salud',
        version: CONFIG.VERSION,
        mensaje: 'Conexión correcta con Google Sheets.'
      });
    }

    if (accion === 'diagnostico') {
      return responder(merge({ ok: true }, diagnostico()));
    }

    if (accion === 'datos' || accion === 'data') {
      asegurarEstructura();
      return responder(merge({ ok: true }, leerTodo()));
    }

    return responder({ ok: false, error: 'Acción GET desconocida: "' + accion + '".' });
  } catch (error) {
    return responder({ ok: false, error: mensajeDeError(error) });
  }
}

/** POST body JSON { accion: "...", ...datos } */
function doPost(e) {
  var lock = null;
  var tomado = false;
  try {
    var cuerpo = leerCuerpo(e);
    var accion = String(cuerpo.accion || '').toLowerCase();

    if (!accion) {
      return responder({ ok: false, error: 'Falta el campo "accion" en el cuerpo de la petición.' });
    }

    // Serializamos las escrituras para que dos peticiones simultáneas
    // no se pisen al momento de agregar/eliminar filas.
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    tomado = true;

    asegurarEstructura();
    var resultado = despachar(accion, cuerpo);

    return responder(merge({ ok: true, accion: accion }, resultado || {}));
  } catch (error) {
    return responder({ ok: false, error: mensajeDeError(error) });
  } finally {
    if (tomado) {
      try { lock.releaseLock(); } catch (e) { /* nada que hacer */ }
    }
  }
}

/** Ejecuta la acción de escritura y devuelve el resultado. */
function despachar(accion, cuerpo) {
  switch (accion) {
    // --- Cuentas ---
    case 'crearcuenta':      return crearCuenta(cuerpo);
    case 'actualizarcuenta': return actualizarCuenta(cuerpo);
    case 'eliminarcuenta':   return eliminarCuenta(cuerpo);

    // --- Movimientos ---
    case 'crearmovimiento':      return crearMovimiento(cuerpo);
    case 'actualizarmovimiento': return actualizarMovimiento(cuerpo);
    case 'eliminarmovimiento':   return eliminarMovimiento(cuerpo);

    // --- Categorías ---
    case 'crearcategoria':      return crearCategoria(cuerpo);
    case 'actualizarcategoria': return actualizarCategoria(cuerpo);
    case 'eliminarcategoria':   return eliminarCategoria(cuerpo);

    // --- Utilidades ---
    case 'sincronizar': return leerTodo();

    default:
      throw new Error('Acción POST desconocida: "' + accion + '".');
  }
}


// ============================================================================
//  ESTRUCTURA DE LA HOJA
// ============================================================================

/**
 * Crea las pestañas y los encabezados que falten y siembra las
 * categorías iniciales. Nunca borra datos existentes.
 */
function asegurarEstructura() {
  var libro = obtenerLibro();
  var nombres = [CONFIG.HOJA_CUENTAS, CONFIG.HOJA_MOVIMIENTOS, CONFIG.HOJA_CATEGORIAS];

  nombres.forEach(function (nombre) {
    var hoja = libro.getSheetByName(nombre);
    if (!hoja) {
      hoja = libro.insertSheet(nombre);
    }

    var encabezados = CONFIG.ENCABEZADOS[nombre];

    if (hoja.getLastRow() === 0) {
      // Pestaña recién creada (o vacía): escribimos los encabezados.
      hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
      hoja.getRange(1, 1, 1, encabezados.length).setFontWeight('bold');
      hoja.setFrozenRows(1);

      if (nombre === CONFIG.HOJA_CATEGORIAS) {
        var filas = CONFIG.CATEGORIAS_INICIALES.map(function (cat) {
          return [Utilities.getUuid(), cat];
        });
        if (filas.length) {
          hoja.getRange(2, 1, filas.length, 2).setValues(filas);
        }
      }

      if (nombre === CONFIG.HOJA_MOVIMIENTOS) {
        hoja.setColumnWidth(2, 110); // Fecha
        hoja.setColumnWidth(3, 240); // Descripción
        hoja.getRange('F:F').setNumberFormat('#,##0.00');
      }
      if (nombre === CONFIG.HOJA_CUENTAS) {
        hoja.getRange('E:E').setNumberFormat('#,##0.00');
      }
    }
  });
}

/** Lectura completa de las tres pestañas. */
function leerTodo() {
  var cuentas = leerCuentas();
  var movimientos = leerMovimientos();
  var categorias = leerCategorias();

  return {
    version: CONFIG.VERSION,
    generadoEn: new Date().toISOString(),
    cuentas: cuentas,
    movimientos: movimientos,
    categorias: categorias
  };
}

function diagnostico() {
  var libro = obtenerLibro();
  var hojas = libro.getSheets().map(function (h) {
    return { nombre: h.getName(), filas: h.getLastRow(), columnas: h.getLastColumn() };
  });
  return {
    libro: libro.getName(),
    url: libro.getUrl(),
    zonaHoraria: libro.getSpreadsheetTimeZone(),
    hojas: hojas,
    version: CONFIG.VERSION
  };
}


// ============================================================================
//  LECTURA
// ============================================================================

/** Devuelve las filas con datos de una pestaña como arreglo de arreglos. */
function leerFilas(nombreHoja) {
  var hoja = obtenerLibro().getSheetByName(nombreHoja);
  if (!hoja) return [];

  var numColumnas = CONFIG.ENCABEZADOS[nombreHoja].length;
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return [];

  var valores = hoja.getRange(2, 1, ultimaFila - 1, numColumnas).getValues();
  var filas = [];
  for (var i = 0; i < valores.length; i++) {
    if (valores[i][0] !== '' && valores[i][0] !== null) filas.push(valores[i]);
  }
  return filas;
}

function leerCuentas() {
  return leerFilas(CONFIG.HOJA_CUENTAS).map(function (f) {
    return {
      id: txt(f[0]),
      nombre: txt(f[1]),
      tipo: normalizar(txt(f[2]).toLowerCase(), CONFIG.TIPOS_CUENTA, 'otro'),
      moneda: (txt(f[3]) || 'MXN').toUpperCase(),
      saldoInicial: num(f[4])
    };
  });
}

function leerMovimientos() {
  var lista = leerFilas(CONFIG.HOJA_MOVIMIENTOS).map(function (f) {
    return {
      id: txt(f[0]),
      fecha: aIso(f[1]),
      descripcion: txt(f[2]),
      categoria: txt(f[3]),
      tipo: normalizar(txt(f[4]).toLowerCase(), CONFIG.TIPOS_MOVIMIENTO, 'egreso'),
      monto: num(f[5]),
      cuentaId: txt(f[6]),
      creadoEn: txt(f[7])
    };
  });

  // Más reciente primero; a igual fecha, el creado más recientemente primero.
  lista.sort(function (a, b) {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    return a.creadoEn < b.creadoEn ? 1 : -1;
  });

  return lista.slice(0, CONFIG.MAX_MOVIMIENTOS);
}

function leerCategorias() {
  return leerFilas(CONFIG.HOJA_CATEGORIAS)
    .map(function (f) {
      return { id: txt(f[0]), nombre: txt(f[1]) };
    })
    .filter(function (c) { return c.nombre !== ''; });
}


// ============================================================================
//  ESCRITURA — CUENTAS
// ============================================================================

function crearCuenta(d) {
  var nombre = txt(d.nombre);
  if (!nombre) throw new Error('El nombre de la cuenta es obligatorio.');

  var hoja = obtenerHoja(CONFIG.HOJA_CUENTAS);
  var repetida = leerCuentas().some(function (c) {
    return c.nombre.toLowerCase() === nombre.toLowerCase();
  });
  if (repetida) throw new Error('Ya existe una cuenta llamada "' + nombre + '".');

  var cuenta = {
    id: d.id ? txt(d.id) : Utilities.getUuid(),
    nombre: nombre,
    tipo: validarEnum(txt(d.tipo).toLowerCase(), CONFIG.TIPOS_CUENTA, 'El tipo de cuenta'),
    moneda: validarMoneda(txt(d.moneda)),
    saldoInicial: num(d.saldoInicial)
  };

  hoja.appendRow([cuenta.id, cuenta.nombre, cuenta.tipo, cuenta.moneda, cuenta.saldoInicial]);

  return { cuenta: cuenta, mensaje: 'Cuenta "' + cuenta.nombre + '" creada.' };
}

function actualizarCuenta(d) {
  var id = txt(d.id);
  if (!id) throw new Error('Falta el id de la cuenta.');

  var hoja = obtenerHoja(CONFIG.HOJA_CUENTAS);
  var fila = filaPorId(hoja, id);
  if (!fila) throw new Error('No se encontró la cuenta con id "' + id + '".');

  var nombre = txt(d.nombre);
  if (!nombre) throw new Error('El nombre de la cuenta es obligatorio.');

  var actual = leerCuentas().filter(function (c) {
    return c.id === id;
  })[0];

  var repetida = leerCuentas().some(function (c) {
    return c.id !== id && c.nombre.toLowerCase() === nombre.toLowerCase();
  });
  if (repetida) throw new Error('Ya existe otra cuenta llamada "' + nombre + '".');

  var cuenta = {
    id: id,
    nombre: nombre,
    tipo: validarEnum(txt(d.tipo).toLowerCase(), CONFIG.TIPOS_CUENTA, 'El tipo de cuenta'),
    moneda: validarMoneda(txt(d.moneda)),
    // Si no viene saldoInicial, conservamos el anterior.
    saldoInicial: d.saldoInicial === undefined || d.saldoInicial === null || d.saldoInicial === ''
      ? (actual ? actual.saldoInicial : 0)
      : num(d.saldoInicial)
  };

  hoja.getRange(fila, 2, 1, 4).setValues([[
    cuenta.nombre, cuenta.tipo, cuenta.moneda, cuenta.saldoInicial
  ]]);

  return { cuenta: cuenta, mensaje: 'Cuenta actualizada.' };
}

function eliminarCuenta(d) {
  var id = txt(d.id);
  if (!id) throw new Error('Falta el id de la cuenta.');

  var movimiento = leerMovimientos().filter(function (m) { return m.cuentaId === id; })[0];
  if (movimiento) {
    throw new Error(
      'No se puede eliminar: la cuenta tiene ' +
      'movimientos asociados (por ejemplo "' + movimiento.descripcion + '"). ' +
      'Elimina o reasigna esos movimientos primero.'
    );
  }

  var hoja = obtenerHoja(CONFIG.HOJA_CUENTAS);
  var fila = filaPorId(hoja, id);
  if (!fila) throw new Error('No se encontró la cuenta con id "' + id + '".');

  hoja.deleteRow(fila);
  return { mensaje: 'Cuenta eliminada.' };
}


// ============================================================================
//  ESCRITURA — MOVIMIENTOS
// ============================================================================

function crearMovimiento(d) {
  var fecha = validarFecha(d.fecha);
  var descripcion = txt(d.descripcion);
  if (!descripcion) throw new Error('La descripción es obligatoria.');

  var hoja = obtenerHoja(CONFIG.HOJA_MOVIMIENTOS);
  var categorias = leerCategorias();

  var categoria = resolverCategoria(txt(d.categoria), categorias, d);
  if (!categorias.some(function (c) { return c.nombre.toLowerCase() === categoria.toLowerCase(); })) {
    categorias.push(crearCategoria({ nombre: categoria }).categoria);
  }

  var cuentaId = txt(d.cuentaId);
  if (!cuentaId) throw new Error('Debes elegir una cuenta.');
  var cuenta = leerCuentas().filter(function (c) { return c.id === cuentaId; })[0];
  if (!cuenta) throw new Error('La cuenta seleccionada no existe. Crea la cuenta primero.');

  var movimiento = {
    id: d.id ? txt(d.id) : Utilities.getUuid(),
    fecha: fecha,
    descripcion: descripcion,
    categoria: categoria,
    tipo: validarEnum(txt(d.tipo).toLowerCase(), CONFIG.TIPOS_MOVIMIENTO, 'El tipo de movimiento'),
    monto: validarMonto(d.monto),
    cuentaId: cuentaId,
    creadoEn: new Date().toISOString()
  };

  hoja.appendRow([
    movimiento.id,
    movimiento.fecha,
    movimiento.descripcion,
    movimiento.categoria,
    movimiento.tipo,
    movimiento.monto,
    movimiento.cuentaId,
    movimiento.creadoEn
  ]);

  return { movimiento: movimiento, mensaje: 'Movimiento registrado.' };
}

function actualizarMovimiento(d) {
  var id = txt(d.id);
  if (!id) throw new Error('Falta el id del movimiento.');

  var hoja = obtenerHoja(CONFIG.HOJA_MOVIMIENTOS);
  var fila = filaPorId(hoja, id);
  if (!fila) throw new Error('No se encontró el movimiento con id "' + id + '".');

  var anterior = leerMovimientos().filter(function (m) { return m.id === id; })[0];

  var fecha = validarFecha(d.fecha);
  var descripcion = txt(d.descripcion);
  if (!descripcion) throw new Error('La descripción es obligatoria.');

  var categorias = leerCategorias();
  var categoria = resolverCategoria(txt(d.categoria), categorias, d);
  if (!categorias.some(function (c) { return c.nombre.toLowerCase() === categoria.toLowerCase(); })) {
    categorias.push(crearCategoria({ nombre: categoria }).categoria);
  }

  var cuentaId = txt(d.cuentaId);
  var cuenta = leerCuentas().filter(function (c) { return c.id === cuentaId; })[0];
  if (!cuenta) throw new Error('La cuenta seleccionada no existe.');

  var movimiento = {
    id: id,
    fecha: fecha,
    descripcion: descripcion,
    categoria: categoria,
    tipo: validarEnum(txt(d.tipo).toLowerCase(), CONFIG.TIPOS_MOVIMIENTO, 'El tipo de movimiento'),
    monto: validarMonto(d.monto),
    cuentaId: cuentaId,
    // Conservamos la fecha de creación original para no alterar el orden.
    creadoEn: anterior ? anterior.creadoEn : new Date().toISOString()
  };

  hoja.getRange(fila, 2, 1, 6).setValues([[
    movimiento.fecha,
    movimiento.descripcion,
    movimiento.categoria,
    movimiento.tipo,
    movimiento.monto,
    movimiento.cuentaId
  ]]);

  return { movimiento: movimiento, mensaje: 'Movimiento actualizado.' };
}

function eliminarMovimiento(d) {
  var id = txt(d.id);
  if (!id) throw new Error('Falta el id del movimiento.');

  var hoja = obtenerHoja(CONFIG.HOJA_MOVIMIENTOS);
  var fila = filaPorId(hoja, id);
  if (!fila) throw new Error('No se encontró el movimiento con id "' + id + '".');

  hoja.deleteRow(fila);
  return { mensaje: 'Movimiento eliminado.' };
}


// ============================================================================
//  ESCRITURA — CATEGORÍAS
// ============================================================================

function crearCategoria(d) {
  var nombre = txt(d.nombre);
  if (!nombre) throw new Error('El nombre de la categoría es obligatorio.');

  var hoja = obtenerHoja(CONFIG.HOJA_CATEGORIAS);
  var repetida = leerCategorias().some(function (c) {
    return c.nombre.toLowerCase() === nombre.toLowerCase();
  });
  if (repetida) throw new Error('Ya existe la categoría "' + nombre + '".');

  var categoria = { id: d.id ? txt(d.id) : Utilities.getUuid(), nombre: nombre };
  hoja.appendRow([categoria.id, categoria.nombre]);

  return { categoria: categoria, mensaje: 'Categoría "' + nombre + '" creada.' };
}

function actualizarCategoria(d) {
  var id = txt(d.id);
  if (!id) throw new Error('Falta el id de la categoría.');

  var nombreNuevo = txt(d.nombre);
  if (!nombreNuevo) throw new Error('El nombre de la categoría es obligatorio.');

  var hoja = obtenerHoja(CONFIG.HOJA_CATEGORIAS);
  var fila = filaPorId(hoja, id);
  if (!fila) throw new Error('No se encontró la categoría con id "' + id + '".');

  var actual = leerCategorias().filter(function (c) { return c.id === id; })[0];
  var nombreViejo = actual ? actual.nombre : '';

  var repetida = leerCategorias().some(function (c) {
    return c.id !== id && c.nombre.toLowerCase() === nombreNuevo.toLowerCase();
  });
  if (repetida) throw new Error('Ya existe otra categoría llamada "' + nombreNuevo + '".');

  hoja.getRange(fila, 2).setValue(nombreNuevo);

  // Propagamos el cambio a los movimientos que usaban el nombre anterior.
  actualizados = 0;
  if (nombreViejo && nombreViejo !== nombreNuevo) {
    actualizados = renombrarCategoriaEnMovimientos(nombreViejo, nombreNuevo);
  }

  return {
    categoria: { id: id, nombre: nombreNuevo },
    mensaje: 'Categoría renombrada (' + actualizados + ' movimiento(s) actualizados).'
  };
}

function eliminarCategoria(d) {
  var id = txt(d.id);
  if (!id) throw new Error('Falta el id de la categoría.');

  var categoria = leerCategorias().filter(function (c) { return c.id === id; })[0];
  var usos = leerMovimientos().filter(function (m) {
    return categoria && m.categoria.toLowerCase() === categoria.nombre.toLowerCase();
  });

  if (usos.length) {
    throw new Error(
      'No se puede eliminar "' + categoria.nombre + '": hay ' + usos.length +
      ' movimiento(s) que la usan. Renómbralos o cámbiales de categoría primero.'
    );
  }

  var hoja = obtenerHoja(CONFIG.HOJA_CATEGORIAS);
  var fila = filaPorId(hoja, id);
  if (!fila) throw new Error('No se encontró la categoría con id "' + id + '".');

  hoja.deleteRow(fila);
  return { mensaje: 'Categoría eliminada.' };
}

/** Reemplaza el nombre de una categoría en todos los movimientos. */
function renombrarCategoriaEnMovimientos(nombreViejo, nombreNuevo) {
  var hoja = obtenerHoja(CONFIG.HOJA_MOVIMIENTOS);
  var numColumnas = CONFIG.ENCABEZADOS[CONFIG.HOJA_MOVIMIENTOS].length;
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return 0;

  var valores = hoja.getRange(2, 1, ultimaFila - 1, numColumnas).getValues();
  var actualizadas = 0;

  for (var i = 0; i < valores.length; i++) {
    if (String(valores[i][3] || '').toLowerCase() === nombreViejo.toLowerCase()) {
      valores[i][3] = nombreNuevo;
      actualizadas++;
    }
  }

  if (actualizadas) {
    hoja.getRange(2, 1, valores.length, numColumnas).setValues(valores);
  }
  return actualizadas;
}


// ============================================================================
//  UTILIDADES
// ============================================================================

/** Devuelve la hoja o lanza un error claro. */
function obtenerHoja(nombre) {
  var hoja = obtenerLibro().getSheetByName(nombre);
  if (!hoja) throw new Error('No se encontró la pestaña "' + nombre + '" en el libro.');
  return hoja;
}

/** Número de fila (1-based) donde está el id en la columna A, o 0. */
function filaPorId(hoja, id) {
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return 0;
  var ids = hoja.getRange(2, 1, ultimaFila - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return 0;
}

/** Texto limpio. */
function txt(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

/** Número seguro (0 si no se puede convertir).
 *  Acepta "1234.56", "1,234.56", "1234,56" y "$1,234.56". */
function num(valor) {
  if (typeof valor === 'number') return isFinite(valor) ? valor : 0;
  if (valor === null || valor === undefined || valor === '') return 0;

  var t = String(valor).trim().replace(/[^\d.,\-]/g, '');
  if (!t) return 0;

  var coma = t.indexOf(',');
  var punto = t.indexOf('.');

  if (coma !== -1 && punto !== -1) {
    // El separador decimal es el que aparece más a la derecha.
    t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (coma !== -1) {
    // "1,234" son miles; "12,5" es decimal.
    var partes = t.split(',');
    t = (partes.length === 2 && partes[1].length === 3 && partes[0].length <= 3)
      ? t.replace(',', '')
      : t.replace(',', '.');
  }

  var n = Number(t);
  return isFinite(n) ? n : 0;
}

/** Convierte a "YYYY-MM-DD" desde Date, texto o número de serie. */
function aIso(valor) {
  if (valor === null || valor === undefined || valor === '') return '';

  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return Utilities.formatDate(
      valor,
      obtenerLibro().getSpreadsheetTimeZone(),
      'yyyy-MM-dd'
    );
  }

  var texto = String(valor).trim();
  var partes = texto.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (partes) {
    return partes[1] + '-' + pad(partes[2]) + '-' + pad(partes[3]);
  }

  var fecha = new Date(texto);
  if (!isNaN(fecha.getTime())) {
    return Utilities.formatDate(
      fecha,
      obtenerLibro().getSpreadsheetTimeZone(),
      'yyyy-MM-dd'
    );
  }
  return '';
}

function pad(n) {
  return String(n).length >= 2 ? String(n) : '0' + String(n);
}

/** Valida y normaliza una fecha a "YYYY-MM-DD". */
function validarFecha(valor) {
  var iso = aIso(valor);
  if (!iso) throw new Error('La fecha no es válida. Usa el formato AAAA-MM-DD.');

  var partes = iso.split('-').map(Number);
  var fecha = new Date(partes[0], partes[1] - 1, partes[2]);
  if (
    fecha.getFullYear() !== partes[0] ||
    fecha.getMonth() !== partes[1] - 1 ||
    fecha.getDate() !== partes[2]
  ) {
    throw new Error('La fecha "' + iso + '" no existe en el calendario.');
  }
  return iso;
}

/** Valida que el monto sea un número mayor que cero. */
function validarMonto(valor) {
  var n = typeof valor === 'number' ? valor : num(valor);
  if (!isFinite(n) || n <= 0) throw new Error('El monto debe ser un número mayor que 0.');
  return Math.round(n * 100) / 100;
}

/** Devuelve el valor si pertenece a la lista, si no lanza error. */
function validarEnum(valor, permitidos, etiqueta) {
  if (permitidos.indexOf(valor) === -1) {
    throw new Error(
      etiqueta + ' inválido: "' + valor + '". Valores permitidos: ' + permitidos.join(', ') + '.'
    );
  }
  return valor;
}

/** Devuelve el valor si es válido, o el respaldo. */
function normalizar(valor, permitidos, respaldo) {
  return permitidos.indexOf(valor) === -1 ? respaldo : valor;
}

function validarMoneda(valor) {
  var codigo = (txt(valor) || 'MXN').toUpperCase();
  if (!/^[A-Z]{3}$/.test(codigo)) {
    throw new Error('La moneda debe ser un código de 3 letras, por ejemplo "MXN".');
  }
  return codigo;
}

/** Nombre de categoría; si viene vacío y se pidió crearla, error claro. */
function resolverCategoria(valor, categorias, datos) {
  var nombre = txt(valor);
  if (!nombre) {
    if (datos && datos.crearCategoria) {
      throw new Error('Escribe el nombre de la nueva categoría.');
    }
    throw new Error('La categoría es obligatoria.');
  }
  return nombre;
}

/** Combina objetos de forma superficial (soporta GAS moderno). */
function merge(a, b) {
  var salida = {};
  var k;
  for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) salida[k] = a[k];
  for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) salida[k] = b[k];
  return salida;
}

/** Lee el cuerpo JSON de la petición (soporta text/plain y formdata). */
function leerCuerpo(e) {
  if (!e) return {};

  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (error) {
      // Si no es JSON válido, intenta el parámetro "payload".
      var params = e.parameter || {};
      if (params.payload) {
        try { return JSON.parse(params.payload); } catch (e2) { /* sigue */ }
      }
      return {};
    }
  }

  if (e.parameter && e.parameter.payload) {
    try { return JSON.parse(e.parameter.payload); } catch (error2) { /* nada */ }
  }
  return {};
}

/** Respuesta JSON. MimeType JSON => el navegador puede leerlo cross-origin. */
function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

function mensajeDeError(error) {
  if (!error) return 'Error desconocido.';
  if (error.message) return error.message;
  return String(error);
}