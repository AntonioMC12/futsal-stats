# Device enrollment (iteration 5)

El acceso compartido mantiene la identidad anónima de Supabase: un dispositivo recibe una sesión
sin email/SSO y consume una invitación creada por un `OWNER`. El token aleatorio solo se devuelve
al crearlo; PostgreSQL conserva exclusivamente su hash SHA-256.

## Flujo

1. Un `OWNER` abre **Ajustes > Gestionar dispositivos**, elige rol y caducidad (5–60 minutos).
2. `create_team_invite` genera 144 bits aleatorios y devuelve el secreto una sola vez.
3. La UI construye localmente un QR hacia `/join?code=…` y un código manual equivalente.
4. El segundo navegador ya tiene una identidad anónima por la inicialización cloud y llama a
   `consume_team_invite`.
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

Revocar elimina la membership dentro de la transacción. La siguiente consulta del dispositivo
revocado falla inmediatamente por RLS aunque su sesión anónima siga siendo válida. Creación/consumo
de invitaciones, cambios de rol y revocaciones dejan un registro en `team_access_audit` sin guardar
el token en claro. Cada arranque cloud actualiza `last_seen_at` de las memberships del dispositivo.

## Comprobación manual

1. Aplicar las migraciones hasta `0003` y habilitar configuración cloud y login anónimo.
2. En navegador A, crear una invitación `VIEWER`; abrir el QR/URL en un perfil limpio B y nombrarlo.
3. Verificar que B ve el Team pero no puede escribir; elevarlo a `EDITOR` desde A y comprobar escritura.
4. Reutilizar el código y probarlo tras su expiración: ambos intentos deben fallar.
5. Revocar B desde A y verificar que una lectura posterior desde B queda bloqueada.
