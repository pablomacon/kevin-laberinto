# Beta 0.1 local — ¿Dónde está Kevin?

## Arranque

Requisitos: Node LTS compatible con Vite 7 (Node 20.19+ o 22.12+; CI usa la última versión de Node 20), npm y una LAN confiable. Desde la raíz:

```bash
npm ci
npm run build
npm run start:local
```

Puerto inicial 3000, configurable con PORT. PowerShell: `$env:PORT = "3001"; npm.cmd run start:local`. En PowerShell usar npm.cmd si la política bloquea npm.ps1. Tras instalar y compilar, el servidor y las páginas funcionan sin acceso a Internet.

El servidor escucha en 0.0.0.0 e imprime su dirección LAN. Compartir únicamente el enlace http://IP-ANFITRION:3000/play con estudiantes. Autorizar Node para la red privada en el firewall de Windows si la política local lo requiere; no abrir ni redirigir puertos en el router. Cada jugador usa un navegador/pestaña independiente y un alias, sin cuenta.

La consola muestra enlaces separados de director y OBS con capacidades aleatorias. El director entra en /admin#TOKEN, espera 3–6 participantes y pulsa Iniciar carrera (deshabilitado si hay menos de 3 jugadores conectados). La carrera empieza simultáneamente tras tres segundos de cuenta regresiva sincronizada. El jugador se mueve con flechas, teclas WASD o controles táctiles D-Pad en pantalla. La vista privada del jugador muestra únicamente el laberinto conocido dentro de una linterna circular de radio cuatro casillas euclidianas, memoria explorada en penumbra y la posición propia con HUD de tiempo y porcentaje de exploración, sin revelar posiciones rivales ni la ubicación de Kevin fuera del campo de visión. Ver a Kevin no gana: hay que alcanzar su casilla física. OBS usa /broadcast#OTRO_TOKEN como fuente de navegador en formato horizontal limpio 16:9 con mapa completo, baliza de Kevin, colores diferenciados para los seis participantes y cronómetro sincronizado sin paneles administrativos. Mantener la consola y el enlace de director privados.

El frontend de la beta multijugador está servido directamente por el servidor local a través de estilos oscuros en `/beta.css` y lógica modular en `/beta-client.js`, sin requerir conexión a internet, frameworks externos ni CDN. /lab sirve el laboratorio compilado con un ajuste de las rutas de assets en la respuesta HTTP; no se cambió la interfaz ni las fuentes del laboratorio. /health permite verificar el arranque. El protocolo y los contratos se respetan de manera estricta según [el contrato](BETA_PROTOCOL.md), asegurando la compatibilidad con dispositivos de estudiantes (incluyendo portátiles Ceibal).

Tras finalizar, el director puede crear otra partida mediante `room.create`: se genera un mapa nuevo, se eliminan sesiones de la carrera anterior y los jugadores deben volver a unirse. Crear partida durante una carrera la reemplaza y descarta sus datos; no hay historial persistente. Ctrl+C detiene HTTP, WebSocket y temporizadores. Las capacidades cambian al reiniciar el proceso.

## Motor y parámetros

`packages/game-core` usa MatchEngine y un Clock inyectable. La infraestructura inyecta performance.now; pruebas usan reloj manual. La espera no acepta movimientos. Las colisiones, frecuencia de 150 ms, visibilidad, memoria, reloj de 240 s, encuentro y reconexión de 30 s se resuelven allí. Intentos de movimiento contra paredes también consumen el intervalo. Cada participante tiene reloj de movimiento independiente; compartir casilla está permitido. Un paquete tardío no amplía la carrera. El servidor procesa órdenes en serie y la primera llegada válida gana.

La configuración inicial de MatchEngine está centralizada en DEFAULT_MATCH_CONFIG y se puede inyectar; no se distribuyen valores por interfaces. Al desconectarse en espera se reserva la entrada 30 s y después se libera; durante una carrera se conserva el participante expirado y su estadística. Ninguna información de tiempo o coordenadas enviada por un cliente es aceptada.

El generador conserva su API y añade minimumKevinDistance. Los nuevos valores predeterminados son mínimo 40 casillas y diferencia relativa ≤30 %. Se construye un grupo de cuatro posiciones válidas (o las disponibles tras recorrer los candidatos) y se escoge con el PRNG; no se abren pasillos de equilibrio. Los tests históricos del 15 % lo configuran explícitamente. Las capacidades criptográficas pertenecen al adaptador Node; el PRNG del mapa no se usa para tokens.

## Distribución de Kevin

`npx tsx scripts/kevin-distribution.ts` produce [KEVIN_DISTRIBUTION.json](KEVIN_DISTRIBUTION.json): 200 semillas reproducibles beta-distribution-0…199, distancias, posición y tiempos; 0 fallos.

Frecuencias 3×3 (arriba a abajo, izquierda a derecha):

|            | Izquierda | Centro | Derecha |
| ---------- | --------: | -----: | ------: |
| Superior   |        13 |     37 |      10 |
| Intermedia |        11 |     66 |       8 |
| Inferior   |         6 |     39 |      10 |

El sector central concentra 33 % y la columna central 71 %. Existe sesgo espacial asociado al margen interior y a la factibilidad de entradas distantes repartidas por los bordes; la selección aleatoria entre candidatos válidos no equivale a una distribución uniforme por sectores. No se forzó igualdad ni se relajaron conectividad, mínimo de 40, ausencia de cuello común o tolerancia 30 %. Calibración humana y posibles ponderaciones por región quedan pendientes de aprobación.

## Estabilidad visual del canvas (KEL-005-B)

Para erradicar el defecto de retroalimentación donde el canvas aumentaba progresivamente de tamaño y se desplazaba hacia abajo con cada tick WebSocket, se implementó una arquitectura desacoplada:

1. **Aislamiento dimensional CSS estricto**: Cada `.canvas-wrapper` opera con dimensiones delimitadas (`position: relative; overflow: hidden; width: 100%; height: 100%; min-width: 0; min-height: 0;`). El elemento `<canvas>` se posiciona de forma absoluta (`position: absolute; top: 0; left: 0; width: 100%; height: 100%;`), saliendo completamente del flujo normal de maquetación CSS. Esto imposibilita físicamente que el tamaño del bitmap altere las dimensiones medidas de su contenedor.
2. **Sincronización desacoplada con ResizeObserver**: La resolución interna del bitmap (`canvas.width`, `canvas.height`) se actualiza exclusivamente cuando el contenedor cambia de tamaño de forma real (detectado mediante `ResizeObserver` y al transicionar vistas). Los mensajes WebSocket entrantes (`player.view`, `broadcast.state`) nunca mutan ni reinician las dimensiones del canvas.
3. **Casillas 1:1 y centrado exacto**: `calculateViewport()` calcula el tamaño entero óptimo de celda `cellSize` mediante `Math.floor(Math.min(availW / cols, availH / rows))` y centra el laberinto (`offsetX`, `offsetY`), garantizando celdas estrictamente cuadradas tanto en pantallas Ceibal (1366 × 768) como en transmisiones OBS (1920 × 1080).
4. **Prueba de regresión automatizada en navegador real**: `npm run test:canvas-stability` lanza una partida local con tres participantes simulados en Microsoft Edge headless mediante Chrome DevTools Protocol (CDP), verificando:
   - Cero variaciones en `canvas.width`, `canvas.height`, `container.clientWidth`, `container.clientHeight` y `getBoundingClientRect()` durante 30 segundos continuos de ticks de juego.
   - Encuadre y dimensiones 100% estables tras movimientos sucesivos.
   - Estabilidad completa en la vista OBS 16:9.
   - Adaptación limpia ante redimensionamiento de ventana sin deriva acumulativa posterior.

## Verificación y dependencias

Ejecutar typecheck, lint, test, build, format:check y npm audit. Las pruebas automatizadas en `tests/beta-interfaces.test.ts` y `tests/beta-protocol-client.test.ts` comprueban 3 y 6 jugadores, privacidad estricta de las vistas privadas, movimientos simultáneos monótonos, cuenta regresiva, temporizador, victoria al alcanzar a Kevin, expiración de tiempo sin ganador, reconexión con sesiones persistidas y rechazo de acciones no autorizadas.

Después de build, `npm run smoke:local` reserva un puerto efímero, arranca el CLI verdadero, verifica HTTP y assets del laboratorio y conecta seis jugadores a través de una IP local del anfitrión; inicia una carrera y apaga su proceso. También se ejecuta en GitHub Actions. Esta comprobación automatizada no sustituye una prueba en los seis equipos físicos ni verifica sus reglas de firewall.

Dependencias añadidas: ws implementa WebSocket estándar en Node; tsx ejecuta el servidor TypeScript sin acoplar el dominio a Node; @types/node y @types/ws son sólo herramientas de desarrollo. El navegador utiliza WebSocket nativo. No se añadieron servicios externos.

HTTP/ws no cifran tráfico ni credenciales. Cualquier observador de la LAN puede capturar tokens; utilizar sólo red confiable, proteger los enlaces de capacidades y no exponer el servidor a Internet. El servidor restringe Host/Origin a direcciones del anfitrión y mismo origen, valida mensajes, limita tamaños/frecuencia y separa cada rol. Eso no sustituye TLS ni protege una LAN comprometida. Estado sólo en memoria: reiniciar el proceso pierde partidas, exploración y sesiones.
