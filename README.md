# Finanzas Personales

App web de finanzas personales en español. Registra tus **cuentas**, anota **ingresos y egresos** y mira un **dashboard** con balance, gráficas y resumen del mes. Los datos viven en una **hoja de Google Sheets**, sin servidor propio ni cuotas.

- Frontend: un solo archivo `index.html` (HTML + CSS + JS puro, sin build, sin dependencias npm).
- Gráficas: [Chart.js](https://www.chartjs.org/) desde CDN.
- Backend: [Google Apps Script](https://developers.google.com/apps-script) publicado como Web App (API REST con `doGet` y `doPost`).
- Instalable: se puede añadir a la pantalla de inicio como una app nativa (PWA).

---

## 1. Contenido del proyecto

```
index.html                 ← la app completa (frontend)
gas/Code.gs                ← el backend para Google Apps Script
manifest.webmanifest       ← datos de la PWA (nombre, iconos, modo standalone)
sw.js                      ← service worker: cachea el app para que abra sin internet
iconos/icon-192.png        ← iconos de la app (generados, ver herramientas/)
iconos/icon-512.png
herramientas/              ← utilidades de desarrollo (tests, servidor local, iconos)
README.md                  ← este archivo
```

> **Nota:** si vienes del esqueleto de Vite/React que había en esta carpeta, ya no se usa.
> El frontend ahora es `index.html` a secas. Puedes borrar sin miedo `src/`, `node_modules/`,
> `package.json`, `package-lock.json`, `tsconfig.json` y `vite.config.ts`.

---

## 2. Configurar la hoja de Google Sheets

### (a) Crear la hoja con las pestañas y encabezados correctos

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva (o usa una que ya tengas).
2. Renombra la pestaña `Hoja 1` a **`Cuentas`**.
3. Crea dos pestañas más y ponles estos nombres exactos: **`Movimientos`** y **`Categorias`**.
4. Escribe los encabezados **en la fila 1**, con mayúscula inicial y sin acentos:

| Pestaña | Columnas (A → H) |
|---|---|
| **Cuentas** | `ID` · `Nombre` · `Tipo` · `Moneda` · `SaldoInicial` |
| **Movimientos** | `ID` · `Fecha` · `Descripcion` · `Categoria` · `Tipo` · `Monto` · `CuentaId` · `CreadoEn` |
| **Categorias** | `ID` · `Nombre` |

5. Deja las filas 2 y siguientes vacías.

**Detalles que importan:**

- **`Fecha` es una columna de TEXTO**, no de fecha. Selecciona la columna B de `Movimientos` →
  *Formato → Número → Texto plano*. Así no hay desfases de zona horaria al leer los datos.
- **`Monto` y `SaldoInicial`** se guardan como números (el script les pone formato `#,##0.00`).
- **`Categoria` guarda el nombre** de la categoría, no su id, para que la hoja se entienda a simple vista.
- **`CreadoEn` es una columna extra** que guarda la fecha y hora de creación. Sirve para ordenar de
  forma estable los movimientos que comparten la misma fecha. Si prefieres no usarla, deja la
  columna vacía: el script la rellena automáticamente.

> **Atajo:** los pasos 1–5 son opcionales. El script **crea las pestañas, los encabezados y las 8
> categorías iniciales por su cuenta** si no las encuentra. Sólo asegúrate de que el libro exista.

---

### (b) Pegar el script en Apps Script

**Opción 1 — la recomendada. Créalo desde la hoja** (el script queda "adherido" a ella):

1. Abre tu hoja de Google Sheets.
2. Menú **Extensiones → Apps Script**. Se abre un editor con un `Code.gs` ya asociado a tu hoja.
3. Borra el contenido, pega **todo** el código de [`gas/Code.gs`](gas/Code.gs) y guarda (Ctrl+S).

> **Importante:** si creas el proyecto en [script.google.com](https://script.google.com) → *Nuevo proyecto*,
> el script queda **independiente** y `SpreadsheetApp.getActiveSpreadsheet()` devuelve `null`
> (error: *"Cannot read properties of null"*). Si lo hiciste así, usa la Opción 2.

**Opción 2 — proyecto independiente** (si ya lo creaste así):

1. Abre [script.google.com](https://script.google.com) → **+ Nuevo proyecto**.
2. Pega el código de `gas/Code.gs` en `Code.gs` y guarda.
3. En `gas/Code.gs`, línea 55, pega el **ID de tu hoja** en la constante:

   ```js
   var ID_HOJA = '1AbCdEf...';
   ```

   El ID está en la URL de tu hoja, entre `/d/` y `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`1AbCdEf...`**`/edit`

   También puedes, en lugar de editar el código, ejecutar **una sola vez** la función
   `conectar()`: elígela en la lista de funciones del editor y pulsa **Ejecutar**. Guarda el ID
   en las propiedades del script.

4. Si al ejecutar `conectar()` Google te pide autorización (porque `SpreadsheetApp.openById`
   requiere el ámbito "hojas de cálculo"), acéptala: solo se concede acceso a tu cuenta.

> No hay que pegar nada más: el script no usa bibliotecas externas.

---

### (c) Publicarlo como Web App con acceso para "Cualquier persona"

1. En el editor de Apps Script haz clic en **Implementar → Nueva implementación**.
2. En el ícono de la llave (🔒) elige **Web app**.
3. Configura:
   - **Descripción**: `API de Finanzas Personales`
   - **Ejecutar como**: **Yo** (tu cuenta)
   - **Quién tiene acceso**: **Cualquier persona**  ← importante
4. Clic en **Implementar** y acepta los permisos. Te pedirá iniciar sesión con una cuenta de Google
   (es normal, es la seguridad de Google; no_publica nada fuera de tu cuenta).
5. Al terminar verás la **URL del Web App**, con esta forma:

   ```
   https://script.google.com/macros/s/AKfycbXXXXXXXXXXXXXXXX/exec
   ```

   **Copia esa URL.** Es la que conecta la app con tu hoja.

> **Cada vez que edites `Code.gs` tienes que volver a publicar** (Implementar → Gestionar
> implementaciones → ícono de lápiz → Editar → *Versión: Nueva versión* → Implementar) para que los cambios
> sirvan. Olvidar esto es el error más común.

---

### (d) Pegar la URL en la configuración de la app

Hay dos formas, elige la que prefieras:

**Opción A — en el código** (para siempre en todos los dispositivos):

Abre `index.html`, ve a la constante `CONFIG` de arriba del todo y pega tu URL:

```js
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbXXXXXXXXXXXXXXXX/exec',
  // ...
};
```

**Opción B — desde la app** (más cómoda, guarda la URL en ese dispositivo):

Abre la app y toca el ícono ⚙ de la esquina superior derecha → pega la URL →
**Probar conexión** → **Guardar**.

> La Opción B tiene prioridad sobre la del código, y es la que se guarda en el `localStorage`
> del navegador. Si borras los datos del navegador, vuelve a pegarla.

---

## 3. Probar la conexión

Abre tu URL del Web App en el navegador y deberías ver algo como:

```json
{"ok":true,"accion":"salud","version":"1.0.0","mensaje":"Conexión correcta con Google Sheets."}
```

- Si ves `{"ok":true,...,"cuentas":[],"movimientos":[],...}` al agregar `?accion=datos`, todo funciona.
- Si ves `{"ok":false,"error":"..."}`, el mensaje te dice exactamente qué pasa.
- Añade `?accion=diagnostico` para ver el nombre del libro, su zona horaria y cuántas filas tiene cada pestaña.

---

## 4. Correr la app en tu computadora (opcional)

Como es HTML puro, basta con abrir `index.html` en el navegador. Pero al abrirlo con `file://`
el service worker no se registra, así que para probarlo como se verá publicado usa el servidor local:

```bash
node herramientas/servidor-local.mjs
# → http://localhost:4173
```

---

## 5. Publicar gratis en internet

Los 5 archivos que se publican son: `index.html`, `manifest.webmanifest`, `sw.js` e
`iconos/icon-192.png` + `iconos/icon-512.png`. **No se sube `gas/Code.gs`** (ese va en Google).

### Netlify Drop (lo más rápido, sin cuenta de consola)

1. Entra en [app.netlify.com/drop](https://app.netlify.com/drop).
2. Arrastra **la carpeta completa** del proyecto (o los archivos sueltos) a la página.
3. En 10 segundos te da una URL tipo `https://tu-app-123.netlify.app`.
4. (Opcional) Arrastra esa URL a la pestaña *Site configuration → Change site name* para ponerle un
   nombre más corto.

### Vercel (con GitHub, ideal si quieres actualizar después)

1. Sube el proyecto a un repositorio de GitHub.
2. Entra en [vercel.com/new](https://vercel.com/new) → importa el repo.
3. **Build Command**: déjalo vacío. **Output Directory**: `.`.
4. *Deploy*. Vercel sirve el `index.html` directamente; no necesita configuración extra.

### GitHub Pages (gratis con tu cuenta de GitHub)

```bash
git init
git add index.html manifest.webmanifest sw.js iconos/
git commit -m "App de finanzas personales"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

Luego, en el repo: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
Tu app queda en `https://TU_USUARIO.github.io/TU_REPO/`.

> Si usas una subcarpeta, todas las rutas del proyecto son relativas (`./manifest.webmanifest`,
> `iconos/...`, `sw.js`), así que funciona sin cambiar nada.

---

## 6. Añadir la app a la pantalla de inicio del celular

Primero publícala en un sitio HTTPS (cualquiera de las tres opciones de arriba). Después:

### Android (Chrome / Edge)

1. Abre la URL de tu app.
2. Menú ⋮ → **Instalar aplicación** (o *Añadir a pantalla de inicio*).
3. Confirma. Aparece un ícono en tu escritorio y se abre **sin barra de navegador**, como una
   app normal.

> Si no aparece la opción, el navegador la ofrece tras un par de visitas, o puedes usar
   *Menú ⋮ → Compartir → Añadir a pantalla de inicio*.

### iPhone / iPad (Safari)

1. Abre la URL en **Safari** (en Chrome no funciona).
2. Toca el botón **Compartir** (el cuadro con flecha hacia arriba).
3. Baja hasta **"Añadir a pantalla de inicio"** → **Añadir**.
4. Listo: ícono con el nombre *Finanzas* en tu pantalla de inicio.

Ambos sistemas usan el ícono de `iconos/icon-192.png` y el nombre del `manifest.webmanifest`
("Finanzas"). El service worker hace que la app abra al instante y siga mostrando la última
información aunque no tengas internet.

---

## 7. Cómo funciona la API

### Lectura (GET)

```
GET ?accion=datos
→ {"ok":true,"version":"1.0.0","generadoEn":"…","cuentas":[…],"movimientos":[…],"categorias":[…]}

GET ?accion=salud
→ {"ok":true,"mensaje":"Conexión correcta con Google Sheets."}

GET ?accion=diagnostico
→ {"ok":true,"libro":"…","hojas":[…],"zonaHoraria":"…"}
```

### Escritura (POST, cuerpo JSON)

| Acción | Campos |
|---|---|
| `crearCuenta` | `nombre`, `tipo`, `moneda`, `saldoInicial` |
| `actualizarCuenta` | `id`, `nombre`, `tipo`, `moneda`, `saldoInicial` |
| `eliminarCuenta` | `id` |
| `crearMovimiento` | `fecha`, `descripcion`, `categoria`, `tipo`, `monto`, `cuentaId` |
| `actualizarMovimiento` | los anteriores + `id` |
| `eliminarMovimiento` | `id` |
| `crearCategoria` | `nombre` |
| `actualizarCategoria` | `id`, `nombre` |
| `eliminarCategoria` | `id` |

Todas las respuestas tienen la forma `{"ok": true, …}` o `{"ok": false, "error": "mensaje en español"}`.
El frontend manda el cuerpo como `text/plain` a propósito: así el navegador no necesita pedir
permiso CORS por adelantado (preflight), que es lo que hace fallar a Apps Script en la mayoría de
implementaciones.

---

## 8. Decisiones que tomé (y conviene que sepas)

1. **Frontend en un solo archivo HTML con JS puro**, sin React. Pediste "un solo archivo" y Chart.js;
   además desplegarlo se reduce a arrastrar archivos, sin compilar nada. React sólo se justificaría
   si el proyecto crece mucho.
2. **La columna `CreadoEn` es un añadido mío** en `Movimientos`. Sin ella, dos movimientos del mismo
   día no se pueden ordenar de forma estable.
3. **La categoría se guarda por nombre** en el movimiento (como pediste en los encabezados) en lugar
   de por id. Al renombrar una categoría, el script actualiza todos los movimientos que la usaban.
4. **No se puede borrar una cuenta con movimientos**, ni una categoría en uso. Es más seguro que
   dejar filas huérfanas; el mensaje de error te dice cuántos elementos dependen de ella.
5. **Los montos siempre son positivos**; el signo lo decide el campo `Tipo` (Ingreso / Egreso).
6. **El balance total suma cuentas de distintas monedas a valor nominal**, sin conversión. Si tienes
   cuentas en USD y MXN, la app te avisa con una nota en el dashboard.
7. **Caché local.** La app guarda una copia en el navegador. Si la hoja no responde, te muestra la
   última copia con un aviso en lugar de una pantalla en blanco. **Antes de publicar la URL
   públicamente, ten en cuenta que quien la tenga puede leer y escribir tu hoja** (ver más abajo).

---

## 9. Seguridad (léelo antes de compartir el enlace)

La Web App está publicada como **"Cualquier persona"**, así que **la URL es una llave**: quien la
tenga puede leer y escribir tu hoja. Eso es perfecto para uso personal, pero si en algún momento
compartes la URL (o publicas la app en internet) cualquiera que la descubra podría modificar tus
datos.

Opciones si quieres cerrarlo:

- **Google Apps Script no tiene autenticación nativa** para Web Apps. La vía habitual es delegated
  auth: cambiar la opción "Cualquier persona" por "Solo yo" y usar un token de Google OAuth, lo
  cual es bastante más complejo de montar.
- Alternativa sencilla: usa una **contraseña en el script**. Añade al principio de `doGet` y `doPost`:

  ```js
  var CLAVE = 'mi-clave-secreta';
  function autorizado(e) {
    var p = (e && e.parameter) || {};
    return (p.clave || '') === CLAVE;
  }
  ```

  y en `doGet`/`doPost` devuelve `{ok:false, error:'No autorizado'}` si `!autorizado(e)`. Luego
  agrega `&clave=mi-clave-secreta` a la URL en `CONFIG.API_URL`. Ten en cuenta que viaja en el
  `localStorage` y en la URL: es una barrera endeble, no criptografía.

---

## 10. Desarrollo: pruebas y utilidades

```bash
node herramientas/pruebas.mjs        # 44 pruebas del frontend (lógica, formato, validación)
node herramientas/pruebas-gas.mjs    # 66 pruebas del backend (CRUD completo sobre Sheets falso)
node herramientas/revision.mjs       # 43 comprobaciones estáticas de index.html
node herramientas/generar-iconos.mjs # regenera los iconos PNG
node herramientas/servidor-local.mjs # sirve la app en http://localhost:4173
```

Las pruebas del backend levantan un **Google Sheets falso en memoria**, así que puedes correr el
CRUD completo (`crearCuenta` → `crearMovimiento` → `actualizar` → `eliminar`) sin tocar una hoja
real. Fue así como se encontraron, entre otros, el `ok:true` que faltaba en `?accion=datos`
(hacían fallar la app entera) y el parser de montos que no entendía `"5,000.50"`.

---

## 11. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Cannot read properties of null (reading 'getSheetByName')` | El script es un proyecto independiente sin hoja asignada | Crea el script desde la hoja (Extensiones → Apps Script) o pega el ID en `ID_HOJA` / ejecuta `conectar()` |
| "No hay ninguna URL de Web App configurada" | No pegaste la URL | ⚙ Configuración → pega la URL → Probar conexión |
| El navegador bloqueó la petición | Abriste `index.html` con doble clic (origen `file://`) | Usa `node herramientas/servidor-local.mjs` y abre `http://localhost:4173` |
| "La respuesta del servidor no es JSON válido" | Usaste la URL `/dev` en vez de `/exec` | Vuelve a Implementar y copia la URL que termina en `/exec` |
| Los cambios no aparecen | Olvidaste volver a publicar tras editar el script | Implementar → Gestionar implementaciones → Editar → Nueva versión |
| "No se encontró la cuenta con id…" | La hoja se borró o se renombró una pestaña | Revisa que los nombres de pestaña sean exactos |
| Las fechas salen un día corridas | La columna `Fecha` quedó con formato de fecha | Selecciónala y ponla en *Texto plano* |
| La gráfica no aparece | Chart.js no se descargó (sin internet la primera vez) | Recarga la página con internet |
| Sale "Cannot read properties of null" | Editaste `index.html` y borraste un `id` | Corre `node herramientas/revision.mjs` |