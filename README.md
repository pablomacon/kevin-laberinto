# Kevin en su laberinto

**Kevin en su laberinto** es un proyecto educativo de exploración competitiva. La
modalidad disponible en la beta local se llama **¿Dónde está Kevin?**: entre tres
y seis participantes recorren el mismo laberinto y gana quien alcanza primero la
casilla de Kevin.

La partida es autoritativa: el navegador sólo envía intenciones de movimiento; el
servidor local decide el mapa, tiempo, movimientos válidos y resultado. Cada
participante ve exclusivamente su propia linterna y memoria de exploración.

## Estado de la beta

La beta 0.1 funciona en una red local con un servidor Node.js y WebSocket. Incluye:

- sala de 3 a 6 participantes, cuenta atrás de 3 segundos y carreras de 240 s;
- movimiento ortogonal, límite de 150 ms, linterna euclidiana de radio 4 y memoria
  individual;
- mapa reproducible de 80 × 45, seis entradas y Kevin inmóvil;
- página de jugador (`/play`), dirección (`/admin`), emisión (`/broadcast`) y
  laboratorio de laberintos (`/lab`);
- capacidades independientes para dirección y OBS, además de reconexión de jugador
  durante 30 segundos;
- interfaz visual de jugador, dirección y transmisión. KEL-005-B aisló el layout
  del canvas: su bitmap se redimensiona sólo ante cambios reales del contenedor,
  no en cada mensaje WebSocket.

No hay cuentas, persistencia, chat, clasificación, torneos ni despliegue público.
La beta no debe exponerse a Internet.

## Arquitectura del monorepositorio

```
apps/
  server-local/  HTTP + WebSocket local y páginas de beta
  web/           laboratorio visual de laberintos (Vite + Phaser)
packages/
  game-core/     reglas puras y estado autoritativo de una carrera
  maze-engine/   generación, BFS y validación de laberintos
  protocol/      contratos y validación de mensajes WebSocket
  identity/      tipos de identidad, sesión y participante
  shared/        tipos transversales
docs/            guías técnicas, contratos, diagnósticos y ADR
tests/           pruebas unitarias e integración
```

El dominio no depende de Node.js, WebSocket, Phaser, Cloudflare ni almacenamiento.
El servidor local es un adaptador que conecta los paquetes de dominio con HTTP y
WebSocket. Más detalle en [la arquitectura](docs/ARCHITECTURE.md).

## Requisitos

- Node.js **20.19 o superior**, o Node.js **22.12 o superior** (Vite 7). La CI usa
  Node 20.
- npm, incluido con Node.js.
- Windows 10/11 para las instrucciones de LAN de esta guía. El repositorio también
  se verifica en Linux mediante GitHub Actions.

Compruebe la instalación:

```powershell
node --version
npm --version
```

## Instalación y primera partida en Windows

1. Clone el repositorio y abra PowerShell en su carpeta raíz.
2. Instale exactamente las dependencias bloqueadas y compile el laboratorio que se
   sirve en `/lab`:

   ```powershell
   npm.cmd ci
   npm.cmd run build
   ```

3. Inicie la beta:

   ```powershell
   npm.cmd run start:local
   ```

   Si PowerShell permite ejecutar `npm` directamente, `npm` y `npm.cmd` son
   equivalentes. El uso de `npm.cmd` evita la política que puede bloquear
   `npm.ps1`.

4. La consola muestra enlaces parecidos a estos:

   ```text
   Kevin Beta 0.1: http://localhost:3000/play
   LAN: http://192.168.x.x:3000/play
   Director: http://localhost:3000/admin#<capacidad-privada>
   OBS: http://localhost:3000/broadcast#<capacidad-privada>
   ```

5. Abra tres pestañas o navegadores en `/play`, escriba un alias distinto en cada
   uno y únase. Abra el enlace de Director, espere a ver tres participantes y pulse
   **Iniciar carrera**. Tras la cuenta atrás, muévase con flechas, WASD o la cruceta
   táctil. Alcanzar la casilla de Kevin termina la carrera; si se agotan 240 s,
   termina sin ganador. El botón de nueva partida del Director reemplaza el mapa y
   obliga a los jugadores a unirse otra vez.

Pulse `Ctrl+C` en la consola para detener servidor, WebSocket y temporizadores.

## LAN, dirección, OBS y laboratorio

El servidor escucha en todas las interfaces locales. Comparta con estudiantes sólo
la URL `http://IP-DEL-ANFITRION:3000/play`; cada dispositivo necesita su propia
pestaña/navegador y alias. No comparta los enlaces de Director u OBS: contienen
capacidades secretas en su fragmento (`#...`). El fragmento no se envía en HTTP,
pero cualquier persona que posea el enlace obtiene ese acceso.

Para una prueba de seis equipos físicos, conecte todos a la misma LAN confiable,
inicie el servidor en el anfitrión, permita Node.js en redes privadas en el Firewall
de Windows y pruebe primero `/health` desde un equipo invitado. No abra puertos en
el router ni reenvíe el puerto a Internet. La guía paso a paso, incluido diagnóstico
de firewall, está en [LOCAL_BETA.md](docs/LOCAL_BETA.md).

- `/play`: vista privada del participante.
- `/admin`: dirección de la sala, estado completo y botones de iniciar/reiniciar.
- `/broadcast`: mapa completo 16:9 destinado a OBS; úselo como **Fuente de
  navegador** con su URL privada, a 1920 × 1080 o la resolución de su escena.
- `/lab`: laboratorio compilado para inspeccionar y generar mapas; no forma parte
  de la carrera ni recibe las capacidades de dirección/OBS.

## Pruebas y comprobaciones

Los comandos disponibles se declaran en `package.json`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run smoke:local
npm.cmd run test:canvas-stability
npm.cmd run format:check
npm.cmd audit
```

`smoke:local` inicia el CLI real y conecta seis clientes WebSocket. La CI ejecuta
typecheck, lint, tests, build, smoke, formato y auditoría. `test:canvas-stability`
comprueba en Edge headless que las vistas de jugador y OBS no aumenten el canvas
durante ticks sucesivos. Estas comprobaciones automatizadas no sustituyen una
partida con personas ni la validación de seis equipos físicos y sus firewalls.

Para desarrollo del laboratorio, use `npm.cmd run dev`; Vite indicará la URL local.

## Limitaciones conocidas

- La distribución de Kevin no es uniforme: en una muestra reproducible de 200
  semillas, la columna central concentró 71 % de las posiciones. No se ha forzado
  una corrección hasta contar con calibración de dificultad humana.
- El estado, sesiones, exploración y resultados existen sólo en memoria: reiniciar
  el proceso los pierde.
- HTTP y WebSocket no usan TLS. Una LAN comprometida puede observar tokens; use una
  red local confiable y no publique el servicio.
- El firewall de Windows, aislamiento de clientes Wi-Fi o una IP equivocada pueden
  impedir el acceso desde la LAN.
- La batería automática usa seis clientes reales, pero aún falta una validación
  completa con seis computadoras físicas y participantes.
- La dificultad humana, la ponderación espacial de Kevin y futuras modalidades
  necesitan evaluación; no están garantizadas sólo por métricas del generador.

## Solución de problemas

| Síntoma                             | Acción                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm` está bloqueado por PowerShell | Use `npm.cmd` en los comandos de esta guía.                                                                                           |
| `/lab` devuelve 404                 | Ejecute `npm.cmd run build` antes de `npm.cmd run start:local`.                                                                       |
| Otro equipo no abre `/play`         | Confirme que usa la IP `LAN:` impresa, la misma red y que Node.js está permitido en red privada. Pruebe `http://IP:3000/health`.      |
| El Director u OBS no reciben estado | Abra exactamente el enlace con `#token` que imprime la consola; no basta con la ruta. Reiniciar el proceso genera nuevas capacidades. |
| No se puede iniciar                 | Deben existir al menos tres jugadores unidos y conectados.                                                                            |
| Un jugador no puede volver          | Reconecte antes de 30 s usando la misma pestaña; al crear una nueva partida o reiniciar el servidor, debe unirse de nuevo.            |
| El canvas se ve recortado           | Redimensione la ventana; el observador de tamaño vuelve a calcular el bitmap sin alterar el layout.                                   |

## Documentación técnica

- [Guía de operación local y LAN](docs/LOCAL_BETA.md)
- [Contrato WebSocket de beta](docs/BETA_PROTOCOL.md)
- [Desarrollo y verificación](docs/DEVELOPMENT.md)
- [Diseño de juego](docs/GAME_DESIGN.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Diagnóstico histórico y distribución de Kevin](docs/MAZE_DIAGNOSTIC.md)
- [Laboratorio visual](docs/MAZE_VIEWER.md)
- [Decisiones arquitectónicas](docs/decisions/)
