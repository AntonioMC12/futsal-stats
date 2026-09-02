# IA local en móviles

La aplicación selecciona el motor local según los límites reales del dispositivo. Ninguna ruta envía consultas ni datos del partido a un servidor de IA.

## Motores

| Dispositivo                                               | Motor                                                    | Modelo                   | Descarga aproximada |
| --------------------------------------------------------- | -------------------------------------------------------- | ------------------------ | ------------------: |
| WebGPU con al menos 32 KiB de memoria de grupo de cómputo | WebLLM 0.2.84 en Web Worker                              | Qwen 2.5 0.5B q4f16_1    |          500–600 MB |
| iPhone/iPad con límite WebGPU de 16 KiB                   | Transformers.js/ONNX Runtime en Web Worker y WebAssembly | SmolLM2 135M Instruct q8 |              145 MB |

El fallback usa la revisión inmutable `b8a5c0f183b78c55955a5364f610c36668b5e681` de `onnx-community/SmolLM2-135M-Instruct-ONNX`. Solo se descarga el modelo del motor seleccionado. Tras la primera descarga, sus archivos quedan en la Cache API del navegador y se pueden reutilizar sin conexión.

En Safari móvil, cuando `SharedArrayBuffer` no está disponible y la página no está aislada entre orígenes, ONNX Runtime se configura con un hilo. La inferencia será más lenta que con WebGPU, pero se realiza fuera del hilo de la interfaz y no bloquea la página.

## Diagnóstico

Con `?debug=true`, Eruda se carga como chunk dinámico y la pantalla de Reglamento RFEF muestra un informe exportable. La comprobación diferencia API WebGPU, adapter, device, una operación compute real, requisitos de WebLLM y el estado del fallback WebAssembly.

WebLLM exige globalmente `maxComputeWorkgroupStorageSize=32768`. El iPad probado ofrece `16384`, por lo que la aplicación registra `WEBLLM_REQUIREMENTS_UNMET` y selecciona WebAssembly antes de intentar inicializar WebLLM. Reducir el contexto o cambiar el modelo de WebLLM no evita esa comprobación del runtime.

Los timeouts miden inactividad, no duración total: cada evento de progreso reinicia un margen de 180 segundos. Una descarga lenta que siga informando progreso no se cancela.

“Borrar caché del modelo” elimina únicamente los archivos del modelo activo mediante la API del runtime correspondiente. No elimina IndexedDB ni datos funcionales de Futsal Stats.
