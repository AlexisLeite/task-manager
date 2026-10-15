# Jornada

Aplicación local de navegador para escribir jornadas con dos partes: **Tareas pendientes importantes** y **Plan de trabajo**. No existe una meta obligatoria de horas.

## Ejecutar

Requiere Node.js 22.12+ y npm.

```sh
npm install
npm run dev
```

Abrir http://127.0.0.1:5173. Usar siempre el mismo origen: `localhost` y `127.0.0.1` guardan sus datos por separado. El servidor queda disponible mientras el proceso esté encendido.

```sh
npm run build
```

El build estático queda en `dist/`. No usa servicios externos ni necesita cuentas.

## Documento y planificación

- Cada tarea tiene un identificador local (`t1`, `t2`...), duración `hh:mm`, prioridad **Baja / Media / Alta** y descripción. Al salir del campo, `2` se convierte en `02:00` y `230` en `02:30`. Letras y minutos inválidos no se aceptan.
- **Todas** las tareas pendientes aparecen automáticamente en el plan. No hay que crearlas otra vez. Sus identidades se conservan cuando se reordenan o se cambia su código.
- Al editar el inicio, el fin se calcula con la duración definida arriba; en bloques paralelos usa la mayor duración. Al editar el fin, se actualiza la duración de las tareas del bloque. Las descripciones del plan reflejan automáticamente los nombres de las tareas.
- Las tareas simultáneas pueden compartir horario. El ejemplo incluye `t2,t3` en un solo bloque. Las referencias pueden agruparse también al pegar una fila tabulada. Cada tarea del bloque tiene su indicador de prioridad: verde, amarillo o rojo, con una etiqueta accesible que identifica tarea y prioridad.
- Reordenar conserva los inicios. **Encadenar horarios** es una acción explícita y reversible para colocar los bloques uno detrás del otro.
- Si se quita un bloque del plan, sus tareas siguen pendientes y aparecen sin horario al final. Para quitar una tarea, se elimina de la sección de tareas. Cortar y pegar mueve filas; al mover definiciones dentro de la misma jornada, se restauran sus referencias originales.
- No existe categoría ni control de descanso. Una tarea llamada “Descanso” se trata como cualquier otra. El total es la unión de los intervalos: no duplica las horas en paralelo.
- Las horas de inicio y fin corresponden al mismo día. Para cruzar medianoche, dividir el trabajo entre jornadas.

**Cargar ejemplo** carga las tareas y horarios del ejemplo original. Está visible en una jornada vacía; si ya tiene datos, está en el menú `⋯` y pide confirmación antes de reemplazarlos. Se puede deshacer.

## Foco

El menú contiene **Foco, Jornada y Mes**. Foco muestra únicamente las actividades planificadas para hoy cuyo intervalo incluye la hora actual, independientemente de la fecha seleccionada en Jornada. Cada actividad muestra el tiempo restante hasta el fin del bloque en `hh:mm:ss`. Se actualiza cada segundo, incluye tareas paralelas y cambia automáticamente al comenzar o terminar un bloque.

## Reconciliación y mes

**Realizado → Comenzar reconciliación desde el plan** copia las tareas y los bloques. Se edita con el mismo editor y conserva la planificación por separado. En realizado se puede modificar también el fin para registrar el tiempo efectivo. Quitar una tarea no realizada significa borrarla de las definiciones de realizado; no modifica las del plan.

Al escribir una descripción, aparecen tareas conocidas que ya tienen tiempo registrado en realizado. Las sugerencias se eligen con flechas y Enter o con clic. Reutilizan una identidad estable entre jornadas; una coincidencia de nombre también la reutiliza.

**Mes** muestra tareas efectivamente realizadas y sus horas, jornadas reconciliadas y total planificado. El tiempo de una tarea se calcula sin duplicar sus propios intervalos. Las horas de tareas diferentes en paralelo se muestran por separado, por lo que su suma puede superar el tiempo total de jornada.

## Teclado y portapapeles

| Acción                                      | Teclas                                            |
| ------------------------------------------- | ------------------------------------------------- |
| Campo siguiente / anterior                  | Tab / Shift+Tab                                   |
| Fila siguiente / anterior                   | ↓ / ↑                                             |
| Inicio / final de línea                     | Home / End                                        |
| Seleccionar línea completa                  | Shift+Home / Shift+End / Shift+Espacio            |
| Seleccionar y ampliar un rango de líneas    | Shift+↑ / Shift+↓                                 |
| Seleccionar con ratón                       | Clic en el arrastrador; Shift+clic para ampliar   |
| Copiar / cortar / pegar filas seleccionadas | Ctrl+C / Ctrl+X / Ctrl+V                          |
| Borrar filas seleccionadas                  | Supr o Backspace                                  |
| Cancelar selección o sugerencias            | Escape                                            |
| Mover fila o grupo seleccionado             | Alt+↑ / Alt+↓                                     |
| Añadir tarea                                | Ctrl+Enter; también Tab al salir del último campo |
| Deshacer / rehacer                          | Ctrl+Z / Ctrl+Shift+Z o Ctrl+Y                    |

En el selector de prioridad, las flechas sin modificadores cambian la opción. En los demás campos se puede seleccionar texto con Shift+←/→ o Ctrl+A sin seleccionar la fila.

Las filas se pegan antes de la fila enfocada, o después si el cursor está al final de su último campo. **Home**, pegar: antes. **End**, pegar: después. No es necesario añadir una fila vacía. El pegado tabulado es compatible con spreadsheets:

- Definiciones: `identificador\tduración\tprioridad\tdescripción`.
- Plan: `referencias\tdescripción\tinicio\tfin`. En planificación el fin se recalcula a partir de las duraciones. En realizado se conserva el fin pegado.

El clipboard interno conserva identidades y referencias; si se copia un bloque a otra jornada, se incluyen las definiciones necesarias. El historial de deshacer mantiene hasta 150 cambios en la sesión; no se conserva al recargar. En macOS se admite Cmd en los atajos principales.

## Tema y copias

El botón **Oscuro / Claro** guarda la preferencia en `jornada.theme` y la aplica antes del primer dibujo de la página. No modifica las jornadas.

El menú `⋯` permite exportar e importar copias JSON. La importación pide confirmación, valida el formato y se puede deshacer. Los fallos de escritura son visibles y permiten exportar los datos en memoria. Los datos corruptos no se sobrescriben.

## Persistencia intercambiable

`src/storage.js` contiene `LocalStorageAdapter` y `Repository`. Para usar un backend, implementar un adaptador con `async load()` y `async save(document)` e inyectarlo en el constructor de `Repository` de `src/app.js`. El editor no usa localStorage para leer o escribir jornadas directamente; la preferencia visual es independiente y local al dispositivo.

```js
class BackendAdapter {
  async load() {
    const response = await fetch("/api/jornadas");
    if (!response.ok) throw new Error("Error al cargar");
    return response.json();
  }
  async save(document) {
    const response = await fetch("/api/jornadas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
    });
    if (!response.ok) throw new Error("Error al guardar");
  }
}
```

El repositorio serializa las escrituras y copia cada snapshot para evitar cambios fuera de orden con un adaptador asíncrono. El contrato es `{version: 2, days: {[fecha]: {plan, actual}}, tasks}`. Cada documento tiene `title`, `intro`, `tasks` y `blocks`. `actual: null` significa que aún no se inició la reconciliación. Las referencias de bloques son IDs de las definiciones, y `taskId` identifica la tarea reutilizable entre jornadas.

Se conserva la clave `jornada.v1` para migrar los datos de la primera implementación. Antes de la primera escritura del formato nuevo se guarda el documento antiguo en `jornada.backup.v1`. La reparación de duplicados conserva los bloques retirados en `recoveredBlocks` y una copia previa en `jornada.backup.before-sync`; los intervalos distintos se mantienen. Los antiguos títulos e introducciones siguen conservados en los datos, aunque ya no aparecen en pantalla. El modelo y la migración están en `src/model.js`. Esta versión está pensada para una pestaña de edición; una integración de backend deberá resolver autenticación y conflictos concurrentes.

## Pruebas

```sh
npx playwright install chromium
npm run test:unit
npm run test:e2e
npx playwright show-report
```

Playwright ejecuta Chromium real, levanta el servidor si es necesario y usa el portapapeles real con un solo worker para evitar interferencias del sistema. Cubre el documento original, referencias entre secciones, inclusión automática de todas las tareas, navegación, selección y movimiento de líneas, clipboard de texto y filas, TSV, drag, deshacer, reconciliación, sugerencias, identidad entre días, resumen mensual, persistencia, copias, migración, errores de almacenamiento, duración, prioridades y tema oscuro.

Las pruebas de contrato verifican que un adaptador asíncrono conserve el orden de escritura, que se pueda guardar después de un error y que la sincronización preserve todas las tareas. El reporte HTML queda en `playwright-report/`; se retienen trazas de fallos y capturas de la pantalla clara, oscura y angosta en `test-results/`. La validación de esta versión cubre Chromium; no certifica otros motores.
