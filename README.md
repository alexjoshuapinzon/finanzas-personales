# Finanzas Personales

App web de finanzas personales en español. Registra tus cuentas, anota ingresos y egresos, y
consulta un dashboard con balance, gráficas y resumen del mes.

Los datos se guardan en **tu propia hoja de Google Sheets**. No hay servidor, no hay base de datos
y no hay conexión con tu banco.

- **Frontend**: un solo archivo `index.html` (HTML + CSS + JavaScript puro, sin compilación).
- **Gráficas**: [Chart.js](https://www.chartjs.org/).
- **Backend**: [Google Apps Script](https://developers.google.com/apps-script) publicado como Web App
  (API REST con `doGet` y `doPost`).
- **Instalable**: se puede añadir a la pantalla de inicio del celular y funciona sin internet.

---

## Contenido

1. [Funcionalidades](#1-funcionalidades)
2. [Instalación](#2-instalación)
3. [Cómo usar la app](#3-cómo-usar-la-app)
4. [Instalar en el celular](#4-instalar-en-el-celular)
5. [Cómo funciona](#5-cómo-funciona)
6. [Seguridad](#6-seguridad)
7. [Problemas frecuentes](#7-problemas-frecuentes)
8. [Desarrollo](#8-desarrollo)

---

## 1. Funcionalidades

### Cuentas
- Alta, edición y baja de cuentas con **nombre, tipo** (efectivo, banco, billetera digital, otro),
  **moneda** y **saldo inicial**.
- El saldo de cada cuenta se calcula solo: `saldo inicial + ingresos − egresos`.
- No se permite borrar una cuenta que tenga movimientos asociados.

### Movimientos
- Alta, edición y baja de movimientos con **fecha, descripción, categoría, tipo** (ingreso o egreso),
  **monto** y **cuenta** asociada.
- La fecha viene puesta en el día actual y se puede cambiar.
- La categoría es una lista desplegable y se pueden **crear categorías nuevas** desde el propio
  formulario o desde la sección *Categorías*.
- Tabla ordenada de más reciente a más antigua, con **filtros** por rango de fechas, categoría, tipo,
  cuenta y búsqueda de texto.
- Totales de ingresos, egresos y balance de lo que se está viendo.

### Captura rápida
- Botón flotante **+ Añadir gasto** siempre visible, en cualquier sección.
- **Atajos** con las categorías que más usas y su último monto: un toque rellena el formulario.
- Al guardar, la notificación indica **cuánto queda del mes** y **cuánto llevas gastado en esa
  categoría**.

### Dashboard
- **Balance total** y tarjetas con el saldo de cada cuenta.
- **Resumen del mes actual**: ingresos, egresos y ahorro neto, con el porcentaje ahorrado.
- **Gráfica de barras** de ingresos frente a egresos por mes, con selector de rango
  (3, 6 o 12 meses, este año, todo, o fechas a medida).
- **Gráfica circular** de egresos por categoría, sobre el mismo rango.

### Progreso y disciplina
Todo esto se calcula a partir de los movimientos, sin datos adicionales:

- **Racha** de días consecutivos registrando, con **día de gracia**: si hoy todavía no registras
  nada, la racha no se pierde hasta que termine el día.
- **XP y 5 niveles**: Principiante → Constante → Disciplinado → Experto → Maestro, con barra de
  avance y los XP que faltan para el siguiente nivel.
- **Panel de cumplimiento** de los últimos 7 días.
- **6 logros**: Primer paso, Racha de 7, Racha de 30, Centinela, Mes completo y Experto.
- **Avisos contextuales** sobre el registro del día y el gasto promedio del mes.

### Otros detalles
- **Formato de moneda** con separador de miles y 2 decimales, ajustado a la configuración regional
  y a la moneda elegida.
- **Modo oscuro** automático según el tema del sistema.
- **Sin internet**: guarda una copia local y muestra la última información conocida con un aviso.
- **Instalable** como PWA, con ícono propio y apertura a pantalla completa.

---

## 2. Instalación

La instalación es de una sola vez. A partir de ahí, la URL queda guardada en el dispositivo.

### 2.1 Crear la hoja

Crea una hoja nueva en [sheets.google.com](https://sheets.google.com) y déjala vacía.

El script crea solo las pestañas, los encabezados y las 8 categorías iniciales. Si prefieres
crearlas tú, deben quedar así (encabezados en la fila 1, sin acentos):

| Pestaña | Columnas (A → H) |
|---|---|
| **Cuentas** | `ID` · `Nombre` · `Tipo` · `Moneda` · `SaldoInicial` |
| **Movimientos** | `ID` · `Fecha` · `Descripcion` · `Categoria` · `Tipo` · `Monto` · `CuentaId` · `CreadoEn` |
| **Categorias** | `ID` · `Nombre` |

Detalles importantes:

- Si creas las pestañas a mano y quieres las 8 categorías iniciales, tienes que escribirlas tú: el
  script solo las siembra en una pestaña completamente vacía.
- **`Fecha` debe ser una columna de texto**, no de fecha. Selecciona la columna B de `Movimientos` →
  *Formato → Número → Texto plano*. Así se evitan desfases de zona horaria.
- `Monto` y `SaldoInicial` se guardan como números, con formato `#,##0.00`.
- `Categoria` guarda el **nombre** de la categoría, para que la hoja se lea de un vistazo.
- `CreadoEn` registra el momento de creación y sirve para ordenar de forma estable los movimientos
  que comparten la misma fecha. El script la rellena automáticamente.

### 2.2 Pegar el script

**Opción recomendada — desde la hoja.** En Google Sheets abre **Extensiones → Apps Script**. El
script queda asociado a tu hoja automáticamente. Borra el contenido de `Code.gs`, pega todo el
código de [`gas/Code.gs`](gas/Code.gs) y guarda.

**Alternativa — proyecto independiente.** Si creaste el proyecto en
[script.google.com](https://script.google.com) → *Nuevo proyecto*, el script no sabe todavía qué
hoja usar. Tienes dos formas de indicárselo:

- Edita [`gas/Code.gs`](gas/Code.gs) y rellena la constante de la línea 64:

  ```js
  var ID_HOJA = '1AbCdEf...';
  ```

  El ID es lo que va entre `/d/` y `/edit` en la URL de tu hoja:
  `https://docs.google.com/spreadsheets/d/`**`1AbCdEf...`**`/edit`

- O ejecuta **una sola vez** la función `conectar()`: elígela en la lista de funciones del editor y
  pulsa *Ejecutar*. El ID queda guardado en las propiedades del script.

Después guarda los cambios y **vuelve a publicar** (siguiente apartado).

### 2.3 Publicar como Web App

1. En el editor de Apps Script: **Implementar → Nueva implementación**.
2. En el ícono de la llave (🔒) elige **Web app**.
3. Rellena:
   - **Descripción**: por ejemplo `API de Finanzas Personales`
   - **Ejecutar como**: **Yo**
   - **Quién tiene acceso**: **Cualquier persona**
4. Pulsa **Implementar** y acepta los permisos que pide Google.
5. Copia la **URL del Web App**:

   ```
   https://script.google.com/macros/s/AKfycbXXXXXXXXXXXXXXXX/exec
   ```

> **Guardar no es publicar.** Cada vez que modifiques `Code.gs` tienes que volver a desplegar:
> *Implementar → Gestionar implementaciones → ícono de lápiz → Editar → Versión: Nueva versión →
> Implementar*.

### 2.4 Configurar la URL en la app

**Desde la app** — recomendado para probar. Abre la app, toca **⚙** en la esquina superior
derecha, pega la URL, pulsa **Probar conexión** y después **Guardar**. Queda almacenada en ese
navegador.

**En el código** — para que valga en todos los dispositivos. En `index.html`, edita la constante
`CONFIG` de la línea 795:

```js
API_URL: 'https://script.google.com/macros/s/AKfycbXXXXXXXXXXXXXXXX/exec',
```

La URL guardada desde la app tiene prioridad sobre la del código.

> **No guardes la URL del Web App en repositorios públicos**: quien la lea puede leer y escribir tu
> hoja. Ver [Seguridad](#6-seguridad).

### 2.5 Comprobar la conexión

Abre la URL del Web App en el navegador con estos parámetros:

| URL | Qué devuelve |
|---|---|
| `…/exec?accion=salud` | `{"ok":true,…}` si el script está desplegado y responde |
| `…/exec?accion=datos` | El JSON con `cuentas`, `movimientos` y `categorias` |
| `…/exec?accion=diagnostico` | Nombre del libro, zona horaria y filas por pestaña |

Si `?accion=datos` responde con las tres colecciones, la instalación está completa.

---

## 3. Cómo usar la app

### Primer uso

1. Ve a **Cuentas** y crea la primera: nombre, tipo, moneda y saldo inicial.
2. Ve a **Movimientos** y anota el primer movimiento con **+ Añadir gasto**.
3. Elige o escribe una categoría. Si no existe, créala en el propio formulario.
4. Al guardar, la notificación te dice cuánto queda del mes.

### Dashboard
- **Balance total** arriba, con los totales históricos de ingresos y egresos.
- **Resumen del mes**: ingresos, egresos y ahorro neto con el porcentaje ahorrado.
- Selector de rango para la gráfica de barras: últimos 3, 6 o 12 meses, este año, todo, o fechas
  personalizadas.
- **Tarjeta *Tu progreso***: nivel, XP, racha, cumplimiento de los últimos 7 días, logros y avisos.

### Movimientos
- Filtra por rango de fechas, categoría, tipo, cuenta o texto libre.
- Cada fila tiene botones para **editar** y **eliminar**.
- Abajo se muestran los totales de los resultados filtrados.
- En *Categorías* puedes crear, renombrar y eliminar. Al renombrar una, se actualizan
  automáticamente los movimientos que la usaban.

### Cuentas
- Cada tarjeta muestra el saldo actual, el tipo y el desglose de ingresos y egresos.
- El saldo se recalcula con cada movimiento nuevo.

---

## 4. Instalar en el celular

La app se sirve desde un sitio HTTPS, por ejemplo el que GitHub Pages publica desde este
repositorio.

**Android (Chrome o Edge)**
1. Abre la URL de la app.
2. Menú **⋮ → Instalar aplicación**.
3. Aparece un ícono en la pantalla de inicio y se abre sin barra de navegador.

**iPhone o iPad (Safari)**
1. Abre la URL en **Safari**.
2. Botón **Compartir**.
3. **Añadir a pantalla de inicio → Añadir**.

---

## 5. Cómo funciona

```
index.html  (la app)
    │  fetch()  →  …/exec?accion=…
    ▼
gas/Code.gs  (Apps Script)
    │  valida y después escribe
    ▼
Google Sheets  (Cuentas · Movimientos · Categorias)
```

La app nunca escribe en la hoja directamente: todas las escrituras pasan por el script, que valida
los datos antes de guardarlos. Las peticiones usan `text/plain` en lugar de `application/json`
para no requerir una verificación CORS previa, que es lo que suele hacer fallar a Apps Script.

### API

**Lectura (`GET`)**

```
?accion=datos        → { ok, version, generadoEn, cuentas, movimientos, categorias }
?accion=salud        → { ok, version, mensaje }
?accion=diagnostico  → { ok, libro, url, zonaHoraria, hojas }
```

**Escritura (`POST`, cuerpo JSON)**

| Acción | Campos |
|---|---|
| `crearCuenta` | `nombre`, `tipo`, `moneda`, `saldoInicial` |
| `actualizarCuenta` | `id`, `nombre`, `tipo`, `moneda`, `saldoInicial` |
| `eliminarCuenta` | `id` |
| `crearMovimiento` | `fecha`, `descripcion`, `categoria`, `tipo`, `monto`, `cuentaId` |
| `actualizarMovimiento` | los anteriores más `id` |
| `eliminarMovimiento` | `id` |
| `crearCategoria` | `nombre` |
| `actualizarCategoria` | `id`, `nombre` |
| `eliminarCategoria` | `id` |

Toda respuesta es `{"ok": true, …}` o `{"ok": false, "error": "mensaje en español"}`.

### Estructura de archivos

```
index.html                 la app completa
gas/Code.gs                backend para Google Apps Script
manifest.webmanifest       datos de la PWA
sw.js                      service worker (uso sin internet)
iconos/                    iconos de la app
herramientas/              utilidades de desarrollo
```

---

## 6. Seguridad

**La URL del Web App es una credencial.** Publicada como *Cualquier persona*, quien la tenga puede
leer y escribir tu hoja.

Esto es lo esperado en uso personal, pero conviene tenerlo presente antes de compartir el enlace.

Apps Script no ofrece autenticación en las Web Apps. Para añadir una contraseña, declara una clave y
una función de autorización al principio de `Code.gs`:

```js
var CLAVE = 'mi-clave-secreta';

function autorizado(e) {
  var p = (e && e.parameter) || {};
  return (p.clave || '') === CLAVE;
}
```

Y en `doGet` y `doPost`, devuelve `{ok: false, error: 'No autorizado'}` cuando `!autorizado(e)`.
Después añade `&clave=mi-clave-secreta` a la URL de la app. La clave viaja en la URL y en el
almacenamiento local del navegador: es una barrera básica, no criptografía.

Otros puntos a tener en cuenta:

- **No subas la URL del Web App a un repositorio público** ni la pegues en un gist. Quedaría
  accesible para siempre en el historial de commits.
- La app guarda una copia de los datos en el navegador. En un dispositivo compartido, cualquiera con
  acceso al perfil del navegador podría verla.
- Nunca conectes la hoja con permisos de edición de terceros.

---

## 7. Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `Cannot read properties of null (reading 'getSheetByName')` | El script es un proyecto independiente y no sabe qué hoja usar | Créalo desde *Extensiones → Apps Script*, o rellena `ID_HOJA`, o ejecuta `conectar()` |
| `No se encontró la hoja de cálculo...` | Igual que el anterior | Igual que el anterior |
| "No hay ninguna URL de Web App configurada" | No se configuró la URL | ⚙ → pega la URL → Probar conexión → Guardar |
| El navegador bloqueó la petición | `index.html` abierto con doble clic (origen `file://`) | Usa el servidor local y entra por `http://localhost:4173` |
| "La respuesta del servidor no es JSON válido" | La URL termina en `/dev` | Vuelve a implementar y copia la URL que termina en `/exec` |
| Conecta pero no guarda nada | Se guardó el código sin publicar | *Implementar → Gestionar implementaciones → Editar → Nueva versión → Implementar* |
| "No se encontró la cuenta con id…" | Se renombró o borró una pestaña | Los nombres de pestaña deben ser exactos |
| El desplegable de categorías llega vacío | Las pestañas se crearon a mano y `Categorias` quedó solo con el encabezado | Escribe las 8 categorías en `Categorias`, o borra esa pestaña para que el script la cree |
| Las fechas salen un día corridas | La columna `Fecha` quedó con formato de fecha | Selecciona la columna y ponla en *Texto plano* |
| El balance no cuadra | Hay cuentas en distintas monedas | El total suma a valor nominal, sin conversión |
| No aparece la gráfica | Chart.js no se pudo descargar | Recarga la página con conexión a internet |

---

## 8. Desarrollo

```bash
node herramientas/pruebas.mjs        # 86 pruebas del frontend
node herramientas/pruebas-gas.mjs    # 79 pruebas del backend
node herramientas/revision.mjs       # 57 comprobaciones estáticas de index.html
node herramientas/generar-iconos.mjs # regenera los iconos
node herramientas/servidor-local.mjs # sirve la app en http://localhost:4173
```

Las pruebas del backend levantan un Google Sheets falso en memoria, así que ejercitan el CRUD
completo sin tocar una hoja real.