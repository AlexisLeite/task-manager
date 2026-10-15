# Jornada

Aplicación local con backend SQLite y editor de navegador para escribir jornadas con dos partes: **Tareas para hoy** y **Plan de trabajo**. No existe una meta obligatoria de horas.

## Ejecutar

Requiere Node.js 22.13+ y npm (SQLite integrado en Node).

```sh
npm install
npm run dev
```

Abrir http://127.0.0.1:5173. Para Console Monitor: `npm run dev -- --port 1111 --strictPort`. El mismo proceso levanta Vite en watch y la API con SQLite. Los datos son compartidos entre navegadores; el tema sigue siendo local a cada navegador.

```sh
npm run build
```

El build queda en `dist/`. `npm start` sirve la app y la API en http://127.0.0.1:1111; `PORT` cambia el puerto. No necesita servicios externos ni cuentas. El servidor está limitado a 127.0.0.1 y pensado para uso local.

## Documento y planificación

- Cada tarea tiene un identificador local (`t1`, `t2`...), duración `hh:mm`, prioridad **Baja / Media / Alta** y descripción. Al salir del campo, `2` se convierte en `02:00` y `230` en `02:30`. Letras y minutos inválidos no se aceptan.
- **Todas** las tareas pendientes aparecen automáticamente en el plan. No hay que crearlas otra vez. Sus identidades se conservan cuando se reordenan o se cambia su código.
- Al editar el inicio, el fin se calcula con la duración definida arriba; en bloques paralelos usa la mayor duración. Al editar el fin, se actualiza la duración de las tareas del bloque. Las descripciones del plan reflejan automáticamente los nombres de las tareas.
- Las tareas simultáneas pueden compartir horario. El ejemplo incluye `t2,t3` en un solo bloque. Las referencias pueden agruparse también al pegar una fila tabulada. Cada tarea del bloque tiene su indicador de prioridad: verde, amarillo o rojo, con una etiqueta accesible que identifica tarea y prioridad.
- Al salir de la grilla Plan de trabajo, las filas se ordenan por inicio; los empates conservan su orden y las filas sin horario quedan al final. Dentro de la grilla no se reordenan automáticamente. Reordenar conserva los inicios. **Encadenar horarios** es una acción explícita y reversible para colocar los bloques uno detrás del otro.
- Si se quita un bloque del plan, sus tareas siguen pendientes y aparecen sin horario al final. Para quitar una tarea, se elimina de la sección de tareas. Cortar y pegar mueve filas; al mover definiciones dentro de la misma jornada, se restauran sus referencias originales.
- No existe categoría ni control de descanso. Una tarea llamada “Descanso” se trata como cualquier otra. El total es la unión de los intervalos: no duplica las horas en paralelo.
- Las horas de inicio y fin corresponden al mismo día. Para cruzar medianoche, dividir el trabajo entre jornadas.

**Cargar ejemplo** carga las tareas y horarios del ejemplo original. Está visible en una jornada vacía; si ya tiene datos, está en el menú `⋯` y pide confirmación antes de reemplazarlos. Se puede deshacer.

Las rutas `/#/foco`, `/#/jornada` y `/#/mes` permiten navegación SPA sin recargar, enlaces directos y Atrás/Adelante. El contenido completo se desliza según la dirección entre pestañas y el encabezado permanece fijo.

## Foco

Un mismo sondeo cada segundo recalcula las actividades según la hora y consulta cambios de otros clientes con ETag (304 si no hay novedades). La actualización es silenciosa; se pospone mientras se edita un campo o hay cambios sin guardar. Al aceptar datos externos se limpia el historial de deshacer para evitar restaurar versiones antiguas. Las tareas nuevas se crean con prioridad baja.

El menú contiene **Foco, Jornada e Historia**. La app abre en Foco. Las actividades en curso muestran controles para reordenar y cambiar prioridades, una cuenta regresiva y una barra fina de tiempo restante. Debajo aparecen en gris oscuro, sin barra, las tareas que comienzan durante las próximas tres horas, incluso si pertenecen al día siguiente. Al pasar el cursor toman el color de las activas. Foco es independiente de la fecha seleccionada en Jornada. Cada actividad muestra el tiempo restante hasta el fin del bloque en `hh:mm:ss`. Se actualiza cada segundo, incluye tareas paralelas y cambia automáticamente al comenzar o terminar un bloque. AutoAnimate desplaza suavemente las filas al retirarse una tarea; respeta la preferencia de movimiento reducido.

El menú ⋮ junto al contador permite **Terminar tarea**, que registra en Realizado el intervalo desde el inicio hasta la hora actual (precisión de minutos), o **Cancelar tarea**, que la retira de Foco sin añadir horas. En pendientes ofrece **Iniciar tarea** y **Cancelar tarea**: iniciar adelanta el comienzo a ahora y conserva su duración. Las acciones se guardan; las tareas paralelas se gestionan individualmente.

## Reconciliación y mes

**Realizado → Comenzar reconciliación desde el plan** copia las tareas y los bloques. Se edita con el mismo editor y conserva la planificación por separado. En realizado se puede modificar también el fin para registrar el tiempo efectivo. Quitar una tarea no realizada significa borrarla de las definiciones de realizado; no modifica las del plan.

Al escribir una descripción, aparecen tareas conocidas que ya tienen tiempo registrado en realizado. Las sugerencias se eligen con flechas y Enter o con clic. Reutilizan una identidad estable entre jornadas; una coincidencia de nombre también la reutiliza.

**Historia** muestra tareas efectivamente realizadas y sus horas, jornadas trabajadas y filtros por rango de fechas. El tiempo de una tarea se calcula sin duplicar sus propios intervalos. Las horas de tareas diferentes en paralelo se muestran por separado, por lo que su suma puede superar el tiempo total de jornada.

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

El círculo de prioridad abre las opciones Baja, Media y Alta, tanto en Tareas para hoy como en Plan de trabajo. Enter abre el menú y Escape lo cierra. En los demás campos se puede seleccionar texto con Shift+←/→ o Ctrl+A sin seleccionar la fila.

Las filas se pegan antes de la fila enfocada, o después si el cursor está al final de su último campo. **Home**, pegar: antes. **End**, pegar: después. No es necesario añadir una fila vacía. El pegado tabulado es compatible con spreadsheets:

- Definiciones: `identificador\tduración\tprioridad\tdescripción`.
- Plan: `referencias\tdescripción\tinicio\tfin`. En planificación el fin se recalcula a partir de las duraciones. En realizado se conserva el fin pegado.

El clipboard interno conserva identidades y referencias; si se copia un bloque a otra jornada, se incluyen las definiciones necesarias. El historial de deshacer mantiene hasta 150 cambios en la sesión; no se conserva al recargar. En macOS se admite Cmd en los atajos principales.

## Tema y copias

El botón **Oscuro / Claro** guarda la preferencia en `jornada.theme` y la aplica antes del primer dibujo de la página. No modifica las jornadas.

El menú `⋯` permite exportar e importar copias JSON. La importación pide confirmación, valida el formato y se puede deshacer. Los fallos de escritura son visibles y permiten exportar los datos en memoria. Los datos corruptos no se sobrescriben.

## SQLite y persistencia intercambiable

La app utiliza `BackendAdapter` de `src/storage.js` por defecto. `Repository` conserva el contrato `load()` / `save(document)` y serializa las escrituras. El adaptador local se mantiene para pruebas aisladas (`vite --mode test`); no hay fallback automático a localStorage si el backend falla.

La base está en `data/worktrack.sqlite` (configurable con `WORKTRACK_DB`). SQLite guarda el documento completo como JSON, incluidos campos históricos, en una transacción atómica con WAL y revisión incremental. `GET /api/workspace` devuelve el documento con ETag; `PUT /api/workspace` exige If-Match. Una escritura desactualizada recibe 409 y muestra un aviso sin sobrescribir datos. `GET /api/health` verifica que el proceso está disponible.

Para inicializar una base vacía con una exportación:

```sh
npm run seed -- "ruta/a/jornada.json"
```

El seed valida el documento, lo importa íntegro y conserva una copia inicial en la tabla `seed_backup`. Rechaza ejecutarse sobre una base que ya tiene datos. La exportación JSON de la interfaz sigue disponible para copias portables. Para copiar directamente los archivos SQLite, detener primero el servidor. La carpeta `data/` está excluida de Git.

Los datos antiguos de localStorage no se importan automáticamente: se utiliza la exportación elegida como seed, para evitar reemplazarla con un estado viejo de otro navegador. El tema sigue guardado en `jornada.theme`.

## Pruebas

```sh
npx playwright install chromium
npm run test:unit
npm run test:e2e
npm run test:backend
npx playwright show-report
```

Playwright ejecuta Chromium real, levanta el servidor si es necesario y usa el portapapeles real con un solo worker para evitar interferencias del sistema. Cubre el documento original, referencias entre secciones, inclusión automática de todas las tareas, navegación, selección y movimiento de líneas, clipboard de texto y filas, TSV, drag, deshacer, reconciliación, sugerencias, identidad entre días, historial con filtros de fechas, persistencia, copias, migración, errores de almacenamiento, duración, prioridades y tema oscuro.

Las pruebas de contrato verifican que un adaptador asíncrono conserve el orden de escritura, que se pueda guardar después de un error y que la sincronización preserve todas las tareas. El reporte HTML queda en `playwright-report/`; se retienen trazas de fallos y capturas de la pantalla clara, oscura y angosta en `test-results/`. La validación de esta versión cubre Chromium; no certifica otros motores.

Las pruebas de backend usan bases SQLite temporales, nunca los datos del usuario. Verifican persistencia al reabrir la base, seed sin sobrescritura, validación, conflictos de revisión, carga desde otro navegador y reconciliación mediante HTTP.


## Historia y acciones de Foco

Historia reúne todo el trabajo realizado, con filtros Desde/Hasta inclusivos, gráficas discretas por jornada y tarea, y acceso a cada jornada. Los intervalos paralelos cuentan una sola vez en el total; cada tarea conserva sus propias horas.

El menú de cada tarea ofrece Ver definición, seguido de las acciones según su estado. Posponer permite elegir día y hora conservando la duración. Las tareas vencidas permanecen visibles con Completa y Reprogramar; esta última conserva las horas invertidas y permite elegir un nuevo horario. Los menús y modales tienen entrada y salida animada, respetando la preferencia de movimiento reducido.
