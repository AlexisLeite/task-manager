# Jornada

Aplicación local con backend SQLite y editor de navegador para escribir jornadas con dos partes: **Tareas para hoy** y **Plan de trabajo**. No existe una meta obligatoria de horas.

## Ejecutar

Requiere Node.js 22.13+ y npm (SQLite integrado en Node).

```sh
npm install
npm run dev
```

Abrir http://127.0.0.1:5173. Para Console Monitor: `npm run dev -- --port 1111 --strictPort`. El mismo proceso levanta Vite en watch y la API con SQLite. Los datos de cada cuenta se comparten entre sus sesiones de navegador; el tema sigue siendo local a cada navegador.

```sh
npm run build
```

El build queda en `dist/`. `npm start` sirve la app y la API en http://127.0.0.1:1111; `PORT` cambia el puerto. No necesita servicios externos. Requiere iniciar sesión. El servidor está limitado a 127.0.0.1 y pensado para uso local.

## Acceso

La cuenta inicial es **alexis**, con contraseña **alexis123**. Al abrir una base anterior, la migración asigna todo su documento a alexis sin cambiar jornadas, tareas, proyectos, campos históricos, revisión ni respaldo inicial. La migración es transaccional y se ejecuta una sola vez; no reemplaza los datos existentes.

La contraseña se guarda con scrypt y sal aleatoria. La sesión dura siete días y se guarda en una cookie HttpOnly y SameSite=Strict; **Cerrar sesión** la revoca en el servidor. La API exige sesión tanto para leer como para guardar. Un navegador nuevo necesita iniciar sesión. No hay registro público de usuarios.

## Backlog

Backlog reúne tareas pendientes sin asignarles una fecha. Cada tarea tiene descripción, proyecto opcional y duración opcional, editables en una grilla de tres columnas: Tarea, Proyecto y Duración. **+ Tarea** o Ctrl+Enter agrega una fila. Flechas, Tab, Inicio/Fin y Enter permiten navegar; Alt+↑/↓ mueve filas, Shift+Espacio selecciona una fila y Shift+↑/↓ extiende la selección. Se pueden copiar, cortar y pegar filas tabuladas y deshacer con Ctrl+Z. Play crea una instancia en Jornada de hoy con inicio a la hora actual; sin duración queda abierta. Repetir Play vuelve a la ejecución existente. La tarea permanece en Backlog hasta completarla desde Jornada o Foco. Pausar el reloj no la retira.

Desde Jornada, **Enviar al backlog** retira la planificación pendiente. Si la tarea está en ejecución, cierra y registra su tramo antes de enviarla; si ya terminó, conserva su historial y la agrega como pendiente. Las tareas paralelas continúan sin cambios. La papelera de Backlog usa la misma confirmación de Jornada, con foco en Eliminar. Eliminar un elemento de Backlog no elimina trabajo registrado ni detiene una instancia en curso. El backlog se guarda y exporta junto con las jornadas.

## Documento y planificación

- Cada tarea tiene un identificador local (`t1`, `t2`...), duración `hh:mm`, prioridad **Baja / Media / Alta** y descripción. Al salir del campo, `2` se convierte en `02:00` y `230` en `02:30`. Letras y minutos inválidos no se aceptan.
- **Todas** las tareas pendientes aparecen automáticamente en el plan. No hay que crearlas otra vez. Sus identidades se conservan cuando se reordenan o se cambia su código.
- Al editar el inicio, el fin se calcula con la duración definida arriba; en bloques paralelos usa la mayor duración. Al editar el fin, se actualiza la duración de las tareas del bloque. Las descripciones del plan reflejan automáticamente los nombres de las tareas.
- Las tareas simultáneas pueden compartir horario. El ejemplo incluye `t2,t3` en un solo bloque. Las referencias pueden agruparse también al pegar una fila tabulada. Cada tarea del bloque tiene su indicador de prioridad: verde, amarillo o rojo, con una etiqueta accesible que identifica tarea y prioridad.
- Al salir de la grilla Plan de trabajo, las filas se ordenan por inicio; los empates conservan su orden y las filas sin horario quedan al final. Dentro de la grilla no se reordenan automáticamente. Reordenar conserva los inicios. **Encadenar horarios** es una acción explícita y reversible para colocar los bloques uno detrás del otro.
- Agregar o eliminar una fila conserva el orden visible, incluidas las continuaciones del día anterior, y mantiene el foco dentro de la grilla. El botón **+ Tarea** y el diálogo de eliminación forman parte de esa edición; el orden cronológico se aplica al salir de la tabla y sus controles.
- Si se quita un bloque del plan, sus tareas siguen pendientes y aparecen sin horario al final. Para quitar una tarea, se elimina de la sección de tareas. Cortar y pegar mueve filas; al mover definiciones dentro de la misma jornada, se restauran sus referencias originales.
- No existe categoría ni control de descanso. Una tarea llamada “Descanso” se trata como cualquier otra. El total es la unión de los intervalos: no duplica las horas en paralelo.
- Las horas de inicio y fin corresponden al mismo día. Para cruzar medianoche, dividir el trabajo entre jornadas.

**Cargar ejemplo** carga las tareas y horarios del ejemplo original. Está visible en una jornada vacía; si ya tiene datos, está en el menú `⋯` y pide confirmación antes de reemplazarlos. Se puede deshacer.

Las rutas `/#/foco`, `/#/jornada` y `/#/mes` permiten navegación SPA sin recargar, enlaces directos y Atrás/Adelante. El contenido completo se desliza según la dirección entre pestañas y el encabezado permanece fijo.

## Foco

Un mismo sondeo cada segundo recalcula las actividades según la hora y consulta cambios de otros clientes con ETag (304 si no hay novedades). La actualización es silenciosa; se pospone mientras se edita un campo o hay cambios sin guardar. Al aceptar datos externos se limpia el historial de deshacer para evitar restaurar versiones antiguas. Las tareas nuevas se crean con prioridad baja.

El menú contiene **Foco, Jornada, Historia y Proyectos**. La app abre en Foco. Las actividades en curso muestran controles para reordenar y cambiar prioridades, una cuenta regresiva y una barra fina de tiempo restante. Debajo aparecen en gris oscuro, sin barra, las tareas que comienzan durante las próximas tres horas, incluso si pertenecen al día siguiente. Al pasar el cursor toman el color de las activas. Foco es independiente de la fecha seleccionada en Jornada. Cada actividad muestra el tiempo restante hasta el fin del bloque en `hh:mm:ss`. Se actualiza cada segundo, incluye tareas paralelas y cambia automáticamente al comenzar o terminar un bloque. AutoAnimate desplaza suavemente las filas al retirarse una tarea; respeta la preferencia de movimiento reducido.

El menú ⋮ junto al contador permite **Terminar tarea**, que registra el trabajo realizado en el intervalo desde el inicio hasta la hora actual (precisión de minutos), o **Cancelar tarea**, que la retira de Foco sin añadir horas. En pendientes ofrece **Iniciar tarea** y **Cancelar tarea**: iniciar adelanta el comienzo a ahora y conserva su duración. Las acciones se guardan; las tareas paralelas se gestionan individualmente.

Al pulsar Play en Jornada sobre una tarea terminada, se crea una nueva instancia sin duración fijada, con inicio en ese momento y el mismo nombre, proyecto e identidad para Historia. La instancia anterior conserva sus horarios y registros realizados. Cambiar el tiempo mueve únicamente las instancias pendientes o en curso. Al cruzar medianoche, el trabajo se reparte entre los bloques de cada día.

Al reanudar el reloj global después de una pausa, se registra el tramo trabajado hasta la pausa y se crea una nueva instancia para cada tarea que estaba en ejecución. La nueva instancia comienza al reanudar y conserva nombre, proyecto e identidad para Historia. Si tenía duración prevista, continúa con el tiempo restante; si era abierta, sigue sin fin fijado. El intervalo de pausa no cuenta como trabajo y las tareas futuras se desplazan según la duración de la pausa.

## Reconciliación y mes

Jornada muestra únicamente **Planificación**. El trabajo realizado se consulta en **Historia** y se genera desde Foco o al marcar explícitamente una tarea como completada. Se conservan los registros históricos existentes; no se copia la planificación como trabajo realizado.

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
- Plan: `referencias\tdescripción\tinicio\tfin`. En planificación el fin se recalcula a partir de las duraciones.

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

### Respaldo automático de SQLite

Mientras el servidor esté iniciado (`npm run dev` o `npm start`), cada 15 minutos se genera una copia consistente de `data/worktrack.sqlite`, incluidos los cambios del WAL. Si cambió, se hace commit y push de un único archivo `worktrack.sqlite` a la rama `sqlite-backup` de `origin`. No modifica la rama de trabajo ni el staging. Requiere Git y las credenciales habituales del usuario que ejecuta el servidor; no depende de Codex ni de tareas de Windows.

El respaldo corre en un proceso separado para no bloquear la aplicación, no superpone ejecuciones y se detiene al cerrar el servidor. Los errores aparecen en la consola y se reintentan en el siguiente intervalo. Las bases alternativas configuradas con `WORKTRACK_DB` no se publican. La carpeta de datos activa continúa excluida de Git; la rama de respaldo contiene una copia SQLite independiente, sin archivos WAL/SHM.

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

El menú de cada tarea ofrece Ver definición, seguido de las acciones según su estado. Enviar al backlog cierra la tarea en Jornada, registra el tiempo trabajado y conserva una copia pendiente en Backlog, sin duplicarla si ya existe. Terminar la completa y la retira del backlog; Cancelar mantiene su comportamiento sin registrar un tramo nuevo. Posponer sigue disponible desde Jornada para elegir día y hora conservando la duración. Las tareas vencidas permanecen visibles con Completa y Reprogramar; esta última conserva las horas invertidas y permite elegir un nuevo horario. Los menús y modales tienen entrada y salida animada, respetando la preferencia de movimiento reducido.


## Proyectos

En Proyectos, escribir un nombre y presionar Enter permite agregarlo sin formularios adicionales. La columna Proyecto, al extremo derecho de Tareas para hoy, asigna una pertenencia opcional a cada tarea. La asignación se conserva al posponer, copiar y registrar trabajo desde Foco. Los registros realizados conservan el proyecto con el que se registraron; cambiar la planificación no reclasifica horas anteriores.

En Historia, el botón Filtros contiene fechas y un selector de uno o varios proyectos, incluida la opción Sin proyecto. Sin selecciones se muestra todo. Totales, gráficas y listas usan el mismo filtro y cuentan una sola vez los intervalos paralelos. La lupa filtra únicamente los nombres de la lista de tareas por coincidencia aproximada.
