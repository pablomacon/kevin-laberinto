# Arquitectura

El flujo permitido de dependencias es: **presentación → aplicación/coordinación → dominio**. Infraestructura implementa puertos definidos hacia el interior y no debe invertir esa dependencia. El dominio no importa ninguna capa exterior.

1. **Presentación:** cliente de jugador, dirección, OBS y laboratorio; renderiza vistas autorizadas y recoge intención.
2. **Aplicación y coordinación:** valida casos de uso, sesiones y entrega de mensajes; actualmente lo implementa el servidor Node.js local.
3. **Dominio:** reglas, partida y laberinto puros y comprobables como biblioteca TypeScript.
4. **Infraestructura:** WebSocket, reloj, almacenamiento y adaptadores de plataforma.

En la beta local, Node.js aloja HTTP, WebSocket, reloj, sesiones y estado activo
en memoria. `apps/server-local` usa `MatchEngine` como autoridad, genera el mapa
con `maze-engine` y valida los mensajes con `protocol`. Las vistas privadas se
envían sólo a su jugador; el estado completo sólo llega a las conexiones con
capacidad de Director u OBS.

Cloudflare, Workers, Durable Objects y D1 son alternativas futuras, no partes de
la beta actual. Si se incorporan, deben implementar puertos hacia el dominio; ningún
paquete de dominio conocerá esos proveedores.

Las dependencias de paquetes siguen el mismo criterio: `shared` es base; `identity` y `maze-engine` pueden usarla; `game-core` compone contratos de identidad y laberinto; `protocol` expresa transporte sin ejecutarlo.
