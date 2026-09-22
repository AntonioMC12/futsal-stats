# Perfil de jugador: edición bajo demanda

## Objetivo y cambio

Antes, la ficha persistente abría el formulario al entrar en el perfil. Ahora muestra los datos guardados en modo consulta y ofrece **Editar** a quienes tienen permisos de escritura. La cabecera, las estadísticas de temporada y carrera y el histórico siguen disponibles. La edición conserva los campos existentes y la foto se prepara como cambio pendiente hasta **Guardar cambios**.

**Cancelar** restaura los valores persistidos. Si hay cambios en el formulario o la foto, se pide confirmación al cancelar o navegar a otra ruta; la salida del navegador activa su aviso nativo. Un error de guardado mantiene abierto el borrador y permite reintentar. El rol `VIEWER` no ve ni puede activar el editor.

## Implementación

- `player-profile-page.ts/html/scss`: estado local de consulta/edición, borrador del formulario y la foto, vista de datos, acciones y diálogo de descarte, foco y presentación adaptable.
- `app.routes.ts`: guardia de desactivación para las navegaciones internas desde el perfil.
- `styles.scss`: estilos de consulta y diálogo acotados al perfil para respetar el presupuesto de estilos del componente.
- Repositorios y casos de uso: sin cambios. Guardado de ficha y operaciones de foto reutilizan `PlayerProfileStore` y los casos de uso existentes, con la misma persistencia local, cloud y cola de sincronización.

## Verificación y límites

La prueba de la página cubre consulta inicial, apertura del editor, descarte, navegación con cambios, fallo de guardado, reintento y acceso de solo lectura. El guardado de ficha y foto usa las operaciones existentes de forma secuencial; si la segunda falla, la primera puede haber quedado guardada, y el editor permanece abierto para reintentar. La foto seleccionada o marcada para eliminar nunca se persiste al cancelar.

Verificación: 98 archivos y 522 pruebas correctas; `npm run build` correcto sin advertencia de presupuesto de estilos del perfil. Continúa la advertencia previa del bundle inicial (791,64 kB frente a 500 kB) y la de `eval` en una dependencia.

Estado: implementado. La comprobación visual real en iPad 1194 × 834 y la prueba entre dispositivos requieren una sesión de navegador y un entorno cloud conectado.
