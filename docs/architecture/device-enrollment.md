# Device enrollment (iteration 5)

El acceso compartido usa identidades estables de Supabase Auth. Una persona inicia sesión por email
y consume una invitación creada por un `OWNER`. El token aleatorio solo se devuelve al crearlo;
PostgreSQL conserva exclusivamente su hash SHA-256. Los nombres históricos de RPC conservan la
palabra `device` por compatibilidad, aunque cada membership representa ahora una cuenta.

## Flujo

1. Un `OWNER` abre **Ajustes > Gestionar dispositivos**, elige rol y caducidad (5–60 minutos).
2. `create_team_invite` genera 144 bits aleatorios y devuelve el secreto una sola vez.
3. La UI construye localmente un QR hacia `/join?code=…` y un código manual equivalente.
4. La persona abre el enlace, inicia sesión si hace falta y llama a `consume_team_invite`.
5. Una transacción bloquea la invitación, comprueba hash, expiración y uso, crea la membership y
   marca el token como usado. Dos consumos simultáneos no pueden tener éxito.

## Autorización

- `OWNER`: lectura/escritura deportiva y administración de dispositivos.
- `EDITOR`: lectura/escritura deportiva; no administra accesos.
- `VIEWER`: lectura; las políticas existentes deniegan las mutaciones deportivas.

Las tablas de invitaciones y auditoría no tienen grants de cliente. Todas las operaciones sensibles
se realizan mediante funciones `security definer` que vuelven a comprobar `auth.uid()` y ownership.
La actualización directa de `team_memberships` queda revocada para impedir saltarse la protección
del último `OWNER`.

Revocar elimina la membership dentro de la transacción. La siguiente consulta de la cuenta
revocada falla inmediatamente por RLS aunque su sesión siga siendo válida. Creación/consumo
de invitaciones, cambios de rol y revocaciones dejan un registro en `team_access_audit` sin guardar
el token en claro. Cada arranque cloud actualiza `last_seen_at` de las memberships del dispositivo.

Tras el siguiente pull cloud, un Team revocado se oculta del workspace local y se borra su rol
guardado. Los datos deportivos pendientes permanecen en IndexedDB para revisión, sin acceso desde
las rutas del Team. La membership sigue siendo la autoridad de acceso a tablas y Storage.

## Comprobación manual

1. Aplicar todas las migraciones y habilitar configuración cloud y login por email.
2. En la cuenta A, crear una invitación `VIEWER`; abrir el QR/URL en un perfil limpio e iniciar sesión con la cuenta B.
3. Verificar que B ve el Team pero no puede escribir; elevarlo a `EDITOR` desde A y comprobar escritura.
4. Reutilizar el código y probarlo tras su expiración: ambos intentos deben fallar.
5. Revocar B desde A y verificar que una lectura posterior desde B queda bloqueada.
