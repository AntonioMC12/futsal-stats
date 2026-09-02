# WebLLM en móviles

La aplicación ejecuta `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` en un Web Worker. Los pesos se guardan mediante el backend predeterminado y más probado de WebLLM: Cache API. No se necesita `SharedArrayBuffer` ni aislamiento entre orígenes para esta configuración, por lo que no se añaden cabeceras COOP/COEP.

## Configuración

|                                            |            Escritorio |                        Móvil |
| ------------------------------------------ | --------------------: | ---------------------------: |
| Modelo                                     | Qwen 2.5 0.5B q4f16_1 |                     El mismo |
| Ventana de contexto                        |                  4096 |                         2048 |
| Prefill chunk compilado                    |                  1024 |                         1024 |
| Memoria gráfica estimada con contexto 4096 |             944,62 MB | Menor al limitar el contexto |
| Engine                                     |  `WebWorkerMLCEngine` |         `WebWorkerMLCEngine` |

No se selecciona otro modelo en móvil: 0.5B ya es el modelo instruct más pequeño de esta familia en el catálogo usado y está marcado por WebLLM como `low_resource_required`.

## Diagnóstico

Con `?debug=true`, Eruda se carga como chunk dinámico y la pantalla de Reglamento RFEF muestra un panel exportable. La comprobación diferencia API WebGPU, adapter, device, una operación compute real y la inicialización de WebLLM. Los listeners globales de errores solo se instalan en este modo.

El timeout de WebLLM mide inactividad, no duración total: cada evento de progreso reinicia un margen de 180 segundos. Una descarga lenta que siga informando progreso no se cancela.

"Borrar caché del modelo" llama a la API de WebLLM para el ID exacto del modelo. No elimina IndexedDB ni ningún dato funcional de Futsal Stats.

## Versión

WebLLM se fija exactamente en 0.2.82. Las versiones 0.2.83 y 0.2.84 tienen una regresión publicada en la caché de formas durante el prefill que puede terminar en `Object has already been disposed` y pérdida del dispositivo GPU con prompts largos. El cambio es reversible actualizando la dependencia y el valor informativo de versión cuando exista una versión corregida. La dependencia `url` cubre una referencia de compatibilidad Node presente en el bundle 0.2.82 y solo se carga junto al chunk diferido de WebLLM.
