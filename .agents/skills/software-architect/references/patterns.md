# Catálogo de Patrones Arquitectónicos

## Patrones de Diseño de Sistemas Distribuidos

---

### Circuit Breaker
**Problema**: Un servicio dependiente falla y las llamadas bloqueadas acumulan threads/recursos,
causando fallo en cascada.

**Solución**: Un "interruptor" que monitorea las llamadas. Si supera un umbral de errores, abre
el circuito (rechaza llamadas inmediatamente). Después de un tiempo, lo intenta de nuevo.

**Estados**: Closed → Open → Half-Open → Closed

**Cuándo usarlo**: Siempre que llames a servicios externos o microservicios internos.

**Herramientas**: Resilience4j (Java), Polly (.NET), hystrix (legacy), istio (service mesh)

---

### Saga Pattern
**Problema**: Las transacciones distribuidas (2PC) son lentas y acopladas. ¿Cómo mantener
consistencia entre varios microservicios?

**Solución**: Secuencia de transacciones locales coordinadas. Si una falla, ejecuta transacciones
compensatorias para deshacer los cambios anteriores.

**Variantes**:
- **Choreography**: Cada servicio publica eventos y reacciona a eventos de otros (desacoplado)
- **Orchestration**: Un orquestador central coordina la secuencia (más control, más acoplamiento)

**Cuándo usarlo**: Transacciones de negocio que cruzan fronteras de servicios.
Ejemplo: Crear pedido → Reservar inventario → Procesar pago → Notificar envío

---

### Event Sourcing
**Problema**: ¿Cómo guardar el historial completo de cambios y poder reconstruir el estado pasado?

**Solución**: En lugar de guardar el estado actual, guarda cada evento que ocurrió. El estado
actual es la proyección de todos los eventos.

```
Eventos: [PedidoCreado] → [PagoAprobado] → [EnvíoIniciado] → [Entregado]
Estado actual = resultado de aplicar todos los eventos en orden
```

**Ventajas**: Auditoría completa, debugging temporal, event replay, múltiples proyecciones

**Desventajas**: Complejidad, eventual consistency, event schema evolution es difícil

**Cuándo usarlo**: Sistemas financieros, auditoría regulatoria, dominios complejos con historial importante.

---

### CQRS (Command Query Responsibility Segregation)
**Problema**: El mismo modelo no sirve igual de bien para lecturas y escrituras.

**Solución**: Separa el modelo de escritura (Command) del modelo de lectura (Query).
Cada uno puede optimizarse independientemente.

```
Escritura: Command → Aggregate → Event Store → Proyección
Lectura:   Query → Read Model (optimizado para la vista)
```

**Cuándo usarlo**: Sistemas con patrones de lectura/escritura muy diferentes, alta escala,
dominios complejos. A menudo se combina con Event Sourcing.

**No siempre es necesario**: Para sistemas simples, CRUD estándar es suficiente.

---

### Outbox Pattern
**Problema**: Al guardar en base de datos y publicar un evento, si falla la publicación del
evento, el dato está guardado pero el evento se perdió. ¿Cómo garantizar consistencia?

**Solución**: Guarda el evento en una tabla "outbox" en la misma transacción que el dato.
Un proceso separado (poller) lee el outbox y publica los eventos al broker.

```
Transaction: [Guardar entidad] + [Guardar evento en outbox] → atómica
Poller: Lee outbox → Publica a Kafka/RabbitMQ → Marca como procesado
```

**Cuándo usarlo**: Siempre que necesites garantía de "at-least-once delivery" de eventos.

---

### Strangler Fig
**Problema**: Tienes un monolito legacy que necesitas migrar sin detener el negocio.

**Solución**: Gradualmente reemplaza partes del sistema legacy con nuevas implementaciones,
usando un proxy/facade que enruta requests al sistema correcto.

```
Fase 1: [Proxy] → [Legacy] (100%)
Fase 2: [Proxy] → [Legacy] (70%) + [Nuevo] (30%)
Fase 3: [Proxy] → [Nuevo] (100%) — Legacy eliminado
```

**Cuándo usarlo**: Migraciones de sistemas legados, refactoring de monolitos a microservicios.

---

### BFF (Backend for Frontend)
**Problema**: Una sola API no sirve igual de bien a múltiples clientes (web, móvil, third-party).

**Solución**: Un BFF por tipo de cliente, cada uno con la API optimizada para su consumidor.

```
[Web Browser] → [BFF Web] ↘
[iOS App]     → [BFF Mobile] → [Servicios Core]
[Partners]    → [Public API] ↗
```

**Cuándo usarlo**: Múltiples tipos de cliente con necesidades muy diferentes de datos.

---

### API Gateway
**Problema**: Los clientes no deberían conocer la topología interna de microservicios.

**Solución**: Un punto de entrada único que enruta, autentica, limita tasa, y agrega responses.

**Responsabilidades**: Auth/AuthZ, Rate limiting, SSL termination, Request routing, Response aggregation

**Herramientas**: Kong, AWS API Gateway, Nginx, Traefik, Envoy

---

### Sidecar Pattern
**Problema**: Funcionalidades transversales (logging, service discovery, TLS) duplicadas en cada servicio.

**Solución**: Deploy de un proceso auxiliar (sidecar) junto a cada instancia del servicio principal.
El sidecar provee las funcionalidades transversales de forma transparente.

**Ejemplo**: Istio/Envoy sidecar para service mesh (mTLS, observabilidad, circuit breaking)

---

## Patrones de Base de Datos

### Database per Service
Cada microservicio tiene su propia base de datos. Nunca comparten esquemas.

### CQRS Read Models
Proyecciones desnormalizadas optimizadas para queries específicos de lectura.

### Sharding
Particionamiento horizontal de datos para escalar lecturas y escrituras.

---

## Anti-patrones Críticos

### Distributed Monolith
Microservicios que se deploys por separado pero están tan acoplados que deben
desplegarse juntos. Peor que un monolito (complejidad sin beneficios).

**Síntomas**: "No podemos deployar el servicio A sin deployar B y C primero"

### Shared Database
Múltiples servicios leyendo y escribiendo en la misma base de datos.
Acoplamiento fuerte, imposibilita cambios independientes.

### God Service
Un microservicio que hace demasiado. Termina siendo un monolito distribuido.

**Señal**: Un servicio que tiene > 20 endpoints y > 5000 líneas de código.

### Chatty APIs
Muchas llamadas de red pequeñas para completar una operación.
Alta latencia, difícil de debuggear.

**Solución**: Agregar en el servidor, usar GraphQL, o rediseñar fronteras.

### Hardcoded Configuration
Configuración (URLs, credenciales, feature flags) hardcodeada en el código.
Imposibilita cambios sin redeploy, riesgo de seguridad.

**Solución**: 12-Factor App principles — configuración en variables de entorno o config service.
