# work.gim.uy

Checkout: `/repos/work-track`, rama `main`, commit inicial desplegado
`8a6688779686ccebce89094f431d3eae5a6af268`.
Datos importados del commit `0ccc2a4f3c0cfccbc769cdfc233015fa38e31761`
de `origin/sqlite-backup`, conservando directamente su SQLite.
La revisión importada es 1027: 6 jornadas y 20 tareas.
Se verificó igualdad exacta de todas las columnas originales de `workspace`
y `seed_backup` después de la migración que asigna el documento a alexis.

Servicio `worktrack.service`, usuario de sistema `worktrack`, Node en
`127.0.0.1:3087`; configuración `/etc/worktrack.env`.
Base activa: `/var/lib/worktrack/worktrack.sqlite`.
Nginx escucha en `127.0.0.1:3088`, agrega Secure a la cookie de sesión y recibe
`work.gim.uy` desde Cloudflare Tunnel. Configuración Nginx instalada en
`/etc/nginx/conf.d/worktrack.conf`; ingress en `/etc/cloudflared/config.yml`.
El dominio está asociado al túnel existente mediante CNAME.
Nginx agrega `Cache-Control: no-store, no-transform` para que Cloudflare
conserve los ETag de revisión. También normaliza revisiones `W/"n"` en
`If-Match` e `If-None-Match` para las pestañas abiertas antes de esta corrección.

## Contraseña de alexis

Desde una terminal de este servidor:

```sh
sudo /repos/work-track/scripts/cambiar-password-alexis.sh
```

Pide y confirma la contraseña sin mostrarla, exige 12 caracteres, guarda
un respaldo SQLite consistente junto a la base antes de cambiarla, actualiza
el hash scrypt y revoca las sesiones de alexis en una transacción.
No necesita reiniciar el servicio. No modifica jornadas ni tareas.
No acepta la contraseña como argumento ni la guarda en el historial del shell.
`WORKTRACK_DB` permite probarlo con otra base existente.

## Respaldos y operación

`worktrack-backup.timer` genera copias consistentes cada 15 minutos en
`/var/backups/worktrack`, conserva las últimas 672 (7 días) y verifica su integridad.
El original importado permanece en
`/var/backups/worktrack/sqlite-backup-original.sqlite` y no se rota.
Las copias contienen datos privados y hashes: permisos 0600 y directorio 0700.
El respaldo automático a Git del código original queda desactivado al usar
una base fuera de `data/`; las copias de este despliegue son locales.

```sh
systemctl status worktrack.service worktrack-backup.timer
journalctl -u worktrack.service -n 50
systemctl start worktrack-backup.service
```

Para actualizar, respaldar primero, actualizar el checkout, ejecutar `npm ci`
y `npm run build`, y reiniciar únicamente `worktrack.service`.
Nunca volver a copiar la SQLite del branch sobre la base activa.
Para restaurar, detener primero `worktrack.service`, guardar la base actual
y sus WAL/SHM, instalar la copia con dueño `worktrack:worktrack` y permisos
0600, y arrancar el servicio. Verificar `/api/health`, acceso y datos.

Los archivos `worktrack*.service`, `worktrack-backup.timer` y
`worktrack.nginx.conf` de esta carpeta son las copias de la configuración instalada.
