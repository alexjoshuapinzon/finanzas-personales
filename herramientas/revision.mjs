/**
 * revision.mjs — Comprobaciones estáticas sobre index.html:
 *  · cada #id que el JS busca existe en el HTML
 *  · cada data-* que el JS usa existe en el HTML
 *  · cada <label for="..."> apunta a un control real
 *  · no hay etiquetas <script>/<style> desbalanceadas
 *  · los tres archivos del PWA están referenciados
 *
 * Uso:  node herramientas/revision.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const gas = readFileSync(join(RAIZ, 'gas', 'Code.gs'), 'utf8');

let ok = 0, fallos = 0;
const grupo = t => console.log(`\n${t}`);
const revisa = (cond, etiqueta, detalle = '') => {
  if (cond) { ok++; console.log(`  ok   ${etiqueta}`); }
  else { fallos++; console.log(`  FALLA ${etiqueta}${detalle ? ' — ' + detalle : ''}`); }
};

// =========================================================================
grupo('Identificadores: todo #id que pide el JS existe en el HTML');
const idsHtml = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const pedidos = new Set([
  ...[...js.matchAll(/\$\('#([a-zA-Z0-9_-]+)'/g)].map(m => m[1]),
  ...[...js.matchAll(/\$\$\('#([a-zA-Z0-9_-]+)'/g)].map(m => m[1]),
  ...[...js.matchAll(/getElementById\('([a-zA-Z0-9_-]+)'\)/g)].map(m => m[1])
]);
const faltan = [...pedidos].filter(id => !idsHtml.has(id)).sort();
revisa(faltan.length === 0, `${pedidos.size} ids solicitados por el JS existen`, `faltan: ${faltan.join(', ')}`);
const huerfanos = [...idsHtml].filter(id => !pedidos.has(id)).sort();
console.log(`       ids en el HTML sin usar desde JS: ${huerfanos.join(', ') || 'ninguno'}`);

// =========================================================================
grupo('Atributos data-* esperados por la delegación de eventos');
const dataUsados = [...new Set([...js.matchAll(/closest\('\[(data-[a-z-]+)\]'\)/g)].map(m => m[1]))].sort();
const dataHtml = [...new Set([...html.matchAll(/\s(data-[a-z-]+)(?==|\s|>)/g)].map(m => m[1]))].sort();
const dataFaltan = dataUsados.filter(d => !dataHtml.includes(d));
revisa(dataFaltan.length === 0, `${dataUsados.length} data-* usados por el JS existen en el HTML`, `faltan: ${dataFaltan.join(', ')}`);
console.log(`       data-* declarados: ${dataHtml.join(', ')}`);

// =========================================================================
grupo('Etiquetas <label for> apuntan a un control existente');
const fors = [...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map(m => m[1]);
const forsRotos = fors.filter(f => !idsHtml.has(f));
revisa(forsRotos.length === 0, `${fors.length} labels apuntan a un id existente`, `rotos: ${forsRotos.join(', ')}`);

// =========================================================================
grupo('Estructura del documento');
const cuenta = (re, etiqueta) => revisa((html.match(re) || []).length === 1, etiqueta);
cuenta(/<html lang="es">/, 'declaración <html lang="es">');
cuenta(/<meta name="viewport"[^>]*width=device-width/, 'meta viewport responsive');
cuenta(/<meta name="theme-color"/, 'meta theme-color');
revisa(html.includes('rel="manifest"'), 'enlaza el manifest (PWA)');
revisa(html.includes('apple-mobile-web-app-capable'), 'soporte iOS "añadir a inicio"');
revisa(html.includes('rel="apple-touch-icon"'), 'icono para iOS');
revisa(/chart\.umd\.min\.js/.test(html), 'carga Chart.js');
revisa(/cdn\.jsdelivr\.net/.test(html), 'Chart.js desde CDN');
revisa((html.match(/<script/g) || []).length === 2, 'exactamente 2 etiquetas <script>');
revisa((html.match(/<style/g) || []).length === 1, 'exactamente 1 bloque <style>');
const jsInline = js;
revisa(!jsInline.includes('</script>'), 'el JS inline no contiene un cierre de script');

grupo('Progreso y captura rápida');
const nuevasIds = ['btn-rapido', 'mm-atajos', 'p-nivel', 'p-xp', 'p-barra', 'p-siguiente',
  'p-sub', 'p-dias', 'p-logros', 'p-alertas', 'd-racha-mini'];
const faltanNuevas = nuevasIds.filter(id => !idsHtml.has(id));
revisa(faltanNuevas.length === 0, `los ${nuevasIds.length} ids nuevos existen`, `faltan: ${faltanNuevas.join(', ')}`);
revisa(js.includes('function rachaActual'), 'implementa el cálculo de racha');
revisa(js.includes('function mejorRacha'), 'implementa la mejor racha');
revisa(js.includes('function calcularXP'), 'implementa el cálculo de XP');
revisa(js.includes('function nivelDeXp'), 'implementa los niveles');
revisa(js.includes('function atajosRapidos'), 'implementa los atajos');
revisa(js.includes('function mostrarResumenTrasGuardar'), 'muestra el resumen tras guardar');
revisa(js.includes('function renderProgreso'), 'renderiza la tarjeta de progreso');
revisa(js.includes('function alertasProgreso'), 'genera alertas');
revisa(html.includes('class="fab"'), 'el botón flotante existe en el HTML');
revisa(/catálogo|categoría.*más usada primero|las categorías más usadas primero/i.test(js),
  'los atajos se ordenan por uso real');
// El día de gracia evita regañar al usuario a media mañana.
revisa(/getDate\(\) - 1/.test(js), 'la racha tiene día de gracia');
revisa(js.includes('const LOGROS') && js.includes('const NIVELES'),
  'logros y niveles definidos como datos, no hardcodeados en el render');
revisa(/NIVELES\.length/.test(js), 'el test de logros referencia NIVELES');

grupo('Modo oscuro y responsive (requisitos de diseño)');
revisa(/prefers-color-scheme:\s*dark/.test(html), 'tema oscuro según el sistema');
revisa(/@media \(max-width:760px\)/.test(html), 'la tabla se adapta a móvil');
revisa(/@media \(min-width:900px\)/.test(html), 'la navegación pasa a arriba en escritorio');
revisa(/env\(safe-area-inset-bottom/.test(html), 'respeta el área segura del celular');
revisa(/--verde:[^;]*;/.test(html) && /--rojo:[^;]*;/.test(html), 'colores verde/rojo definidos');

grupo('Archivos del PWA presentes');
['index.html', 'manifest.webmanifest', 'sw.js', 'iconos/icon-192.png', 'iconos/icon-512.png', 'gas/Code.gs']
  .forEach(f => revisa(existsSync(join(RAIZ, f)), `existe ${f}`));

// =========================================================================
grupo('Coherencia de la configuración entre app y script');
const apiUrl = (js.match(/API_URL:\s*'([^']*)'/) || [])[1];
revisa(!!apiUrl, 'la app define API_URL como constante', 'no se encontró');
revisa(/PEGA_AQUI_TU_URL_DEL_WEB_APP/.test(js), 'API_URL trae una señal de "pendiente de configurar"');

// Acciones de escritura que la app le pide al script...
const accionesScript = new Set([...gas.matchAll(/case '([a-z]+)':/g)].map(m => m[1]));
const accionesApp = new Set([...js.matchAll(/'(crear|actualizar|eliminar)(Cuenta|Movimiento|Categoria)'/g)]
  .map(m => m[0].slice(1, -1).toLowerCase()));
revisa(accionesApp.size === 9, `la app usa las ${accionesApp.size} acciones de escritura`);
[...accionesApp].sort().forEach(a => revisa(accionesScript.has(a), `el script implementa "${a}"`));

// Acciones GET que la app consulta...
revisa(accionesScript.has('sincronizar') || /accion=datos/.test(js), 'la app pide ?accion=datos');
revisa(/accion=salud/.test(js), 'la app prueba la conexión con ?accion=salud');

// El servidor debe validar lo mismo que valida el formulario.
['El monto debe ser un número mayor que 0', 'no existe en el calendario',
 'es obligatoria', 'debe ser un código de 3 letras'].forEach(m =>
  revisa(gas.includes(m), `el servidor valida: "${m}"`));

console.log(`\n${'='.repeat(56)}\n${ok} comprobaciones correctas, ${fallos} fallo(s)\n${'='.repeat(56)}`);
process.exit(fallos ? 1 : 0);