# Offline sync y recuperacion

La operativa de partido es local-first. En modo cloud, los contratos de repositorio se resuelven a
adaptadores `Offline*Repository`: leen desde IndexedDB y guardan el dato local junto con una
operacion de salida durable. Supabase no forma parte de la ruta critica de un gol, una falta, una
tarjeta, una sustitucion ni un cambio del reloj.

## Escritura atomica

Dexie v7 incorpora `syncQueue`. `OfflineMatchEventRepository.commit(match, events)` escribe en una
sola transaccion:

1. los eventos append-only;
2. el snapshot recuperable del partido;
3. la operacion `match-events-commit` del outbox.

Una recarga o cierre inesperado no puede dejar un evento confirmado en la interfaz sin su trabajo
de sincronizacion correspondiente. Las operaciones del mismo partido se compactan por `dedupeKey`
y los eventos por UUID. La RPC cloud tambien es idempotente (`on conflict (id) do nothing`), de
modo que repetir un envio cuya respuesta se perdio no duplica eventos.

## Estados y reintentos

Los registros locales mantienen `syncStatus: pending | synced | failed`. La cola persiste intentos,
proxima ejecucion y ultimo error. Los fallos transitorios usan backoff exponencial de 1 segundo a 5
minutos y pasan a `failed` tras cinco intentos. Los errores de autorizacion, validacion o conflicto
operativo se marcan como irrecuperables inmediatamente.

`OfflineSyncService` escucha la conectividad del navegador, reanuda el envio al volver la red y
expone en el live match un indicador compacto. Los errores `failed` muestran el detalle y permiten
un reintento manual. La observabilidad disponible incluye pendientes, fallidos, intentos y ultima
sincronizacion correcta.

## Arranque y convergencia

Al arrancar en modo cloud:

1. se recuperan cambios locales `pending` antiguos que aun no tengan outbox;
2. se envia la cola en orden de creacion;
3. se descarga una instantanea autorizada de equipos, jugadores, perfiles, partidos y eventos;
4. se actualiza la cache sin sobrescribir registros locales `pending` o `failed`.

Sin conectividad, el workspace y el partido se abren desde la cache. La politica inicial de
conflictos mantiene un solo controlador del live match. La creacion remota de un segundo partido
activo queda como error visible y accionable; no se intenta mezclar dos lineas de eventos.

## Migracion y recuperacion

El paso de Dexie v6 a v7 solo anade `syncQueue`; no transforma ni elimina datos existentes. Si el
navegador se cierra durante el upgrade, IndexedDB revierte la transaccion de version. Al volver a
abrir, Dexie reintenta la migracion. No debe borrarse la base local para resolver errores de sync:
se conserva la cola y se usa `Reintentar` cuando se haya corregido conectividad, permisos o el
conflicto indicado.
