# Experiencia de usuario

- El trabajo realizado se genera exclusivamente mediante las acciones de Foco. La vista Realizado es de consulta: no permitir edición manual ni copiar la planificación como realizado. Conservar los registros históricos existentes.

- Todos los cambios dinámicos de contenido deben animarse: inserciones, eliminaciones, reordenamientos, agrupación y separación de tareas, cambios de tamaño, filtros, menús y modales.
- Las tareas de Foco deben desplazarse suavemente también cuando pasan a compartir horario o dejan de compartirlo. Animar los cambios de espacio y los controles que aparecen, además del movimiento de las filas.
- Reutilizar AutoAnimate y las transiciones existentes. Mantener el foco, la selección y la edición durante las actualizaciones; no reconstruir controles activos para animarlos.
- Respetar `prefers-reduced-motion` y verificar los cambios relevantes en navegador con Playwright.

<!-- codebase-memory-mcp:start -->
# Codebase Knowledge Graph (codebase-memory-mcp)

Preferir las herramientas MCP del grafo para descubrir código: `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`, en ese orden. Usar búsquedas de archivos/texto cuando esas herramientas no estén disponibles o no den resultados suficientes, y para literales, configuración y archivos que no sean código.
<!-- codebase-memory-mcp:end -->
