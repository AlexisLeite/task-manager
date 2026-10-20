#!/usr/bin/env python3
"""Consistent local snapshot, including committed SQLite WAL changes."""
import datetime
import os
import pathlib
import sqlite3

os.umask(0o077)
directory = pathlib.Path('/var/backups/worktrack')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
target = directory / f'worktrack-{stamp}.sqlite'
try:
    with sqlite3.connect('file:/var/lib/worktrack/worktrack.sqlite?mode=ro', uri=True) as source:
        with sqlite3.connect(target) as destination:
            source.backup(destination)
            if destination.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise RuntimeError('El respaldo no superó integrity_check')
except Exception:
    target.unlink(missing_ok=True)
    raise
for old in sorted(directory.glob('worktrack-*.sqlite'))[:-672]:
    old.unlink()
print(f'Respaldo íntegro: {target}')
