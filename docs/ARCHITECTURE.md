# Arquitectura

El flujo permitido de dependencias es: **presentación → aplicación/coordinación → dominio**. Infraestructura implementa puertos definidos hacia el interior y no debe invertir esa dependencia. El dominio no importa ninguna capa exterior.

1. **Presentación:** cliente web, director y OBS; renderiza vistas autorizadas y recoge intención.
2. **Aplicación y coordinación:** valida casos de uso, sesiones y entrega de mensajes; en local será el servidor Node.js.
3. **Dominio:** reglas, partida y laberinto puros y comprobables como biblioteca TypeScript.
4. **Infraestructura:** WebSocket, reloj, almacenamiento y adaptadores de plataforma.

En local, Node.js alojará los adaptadores y el estado activo en memoria. En Cloudflare, Workers expondrán transporte, Durable Objects coordinarán una partida y D1 persistirá datos que el dominio solicite a través de puertos. Ningún paquete de dominio conoce esos proveedores.

Las dependencias de paquetes siguen el mismo criterio: `shared` es base; `identity` y `maze-engine` pueden usarla; `game-core` compone contratos de identidad y laberinto; `protocol` expresa transporte sin ejecutarlo.
