# Auditoría Arquitectónica — Guía de Referencia

## Objetivo de una Auditoría

Una auditoría arquitectónica evalúa si el sistema actual soporta los objetivos del negocio,
identifica riesgos y deuda técnica, y propone un camino de mejora priorizado.

---

## Estructura de la Auditoría

### Fase 1: Recolección de Contexto
Antes de emitir juicios, recopila:

**Sobre el negocio:**
- ¿Cuál es el propósito del sistema? ¿A quién sirve?
- ¿Cuáles son los SLAs actuales y los esperados?
- ¿Cuántos usuarios / transacciones por día?
- ¿Cuál es el costo de downtime?
- ¿Hay planes de crecimiento o cambios de negocio próximos?

**Sobre el equipo:**
- Tamaño del equipo de ingeniería
- Nivel de madurez técnica
- Procesos de desarrollo actuales (CI/CD, revisiones, testing)

**Sobre el sistema:**
- Lenguajes, frameworks, bases de datos, plataformas
- Antigüedad del sistema
- Documentación existente
- Incidentes recientes o recurrentes

---

### Fase 2: Evaluación por Dimensiones

Para cada dimensión, califica: 🟢 Bien / 🟡 Mejora necesaria / 🔴 Riesgo crítico

#### 2.1 Estructura y Diseño
- [ ] ¿Existe separación clara de responsabilidades (capas, módulos, servicios)?
- [ ] ¿Las dependencias van en la dirección correcta? ¿Hay ciclos de dependencia?
- [ ] ¿El sistema tiene fronteras bien definidas (bounded contexts)?
- [ ] ¿Hay God Classes / God Services?
- [ ] ¿El acoplamiento entre módulos es bajo? ¿La cohesión es alta?
- [ ] ¿Se usan patrones apropiados para el dominio?

#### 2.2 Escalabilidad
- [ ] ¿El sistema puede escalar horizontalmente?
- [ ] ¿Existen cuellos de botella conocidos (DB, servicios síncronos, recursos compartidos)?
- [ ] ¿Hay caching implementado correctamente? ¿O hay cache invalidation incorrecta?
- [ ] ¿Las operaciones costosas son asíncronas?
- [ ] ¿Los servicios son stateless (o el estado se gestiona correctamente)?

#### 2.3 Disponibilidad y Resiliencia
- [ ] ¿Hay Single Points of Failure (SPOF)?
- [ ] ¿Existen Circuit Breakers / Retry policies entre servicios?
- [ ] ¿Hay mecanismos de graceful degradation?
- [ ] ¿El sistema se recupera automáticamente de fallos comunes?
- [ ] ¿Están implementados health checks y readiness/liveness probes?
- [ ] ¿Existe una estrategia de disaster recovery documentada y probada?

#### 2.4 Seguridad
- [ ] ¿La autenticación y autorización están centralizadas?
- [ ] ¿Los secretos se gestionan con un vault / variables de entorno seguras?
- [ ] ¿Las APIs validan input correctamente (OWASP Top 10)?
- [ ] ¿La comunicación entre servicios está cifrada (TLS mutual)?
- [ ] ¿Hay principio de mínimo privilegio aplicado?
- [ ] ¿Se realizan auditorías de acceso?
- [ ] ¿Hay protección contra inyección SQL, XSS, CSRF?

#### 2.5 Observabilidad
- [ ] ¿Hay logging estructurado (JSON) con correlation IDs?
- [ ] ¿Existen métricas (latencia, error rate, throughput) expuestas y monitoreadas?
- [ ] ¿Hay distributed tracing implementado?
- [ ] ¿Los alertas están configurados con umbrales apropiados?
- [ ] ¿Existe un dashboard operacional?
- [ ] ¿El MTTR (tiempo de recuperación) es medible?

#### 2.6 Base de Datos y Datos
- [ ] ¿El modelo de datos refleja el dominio correctamente?
- [ ] ¿Existen índices apropiados para las queries más frecuentes?
- [ ] ¿Hay migrations versionadas y reversibles?
- [ ] ¿Las transacciones tienen el scope correcto?
- [ ] ¿Se usa el tipo de base de datos adecuado para cada caso (relacional, documental, caché)?
- [ ] ¿Está el backup automatizado y probado?

#### 2.7 APIs y Contratos
- [ ] ¿Las APIs tienen versionado?
- [ ] ¿Existe documentación (OpenAPI/Swagger) actualizada?
- [ ] ¿Hay contratos de API definidos (consumer-driven contracts)?
- [ ] ¿Los cambios breaking están comunicados con deprecation notice?

#### 2.8 CI/CD y DevOps
- [ ] ¿El pipeline incluye tests automáticos (unit, integration, e2e)?
- [ ] ¿Hay análisis de calidad de código (linters, SAST)?
- [ ] ¿Los deployments son frecuentes y pequeños?
- [ ] ¿Existe la posibilidad de rollback rápido?
- [ ] ¿Los ambientes de desarrollo, staging y producción son consistentes?
- [ ] ¿La infraestructura es código (IaC)?

#### 2.9 Deuda Técnica
- [ ] ¿Está la deuda técnica identificada y registrada?
- [ ] ¿Se dedica tiempo del sprint a reducir deuda?
- [ ] ¿Hay código muerto o dependencias sin usar?
- [ ] ¿Las dependencias externas están actualizadas?

---

### Fase 3: Informe de Auditoría

Estructura el informe así:

```
# Auditoría Arquitectónica — [Nombre del Sistema]
Fecha: [fecha]
Auditor: [nombre]

## Resumen Ejecutivo
[2-3 párrafos: estado general, hallazgos principales, recomendación urgente si aplica]

## Fortalezas Identificadas
[Lo que el equipo hace bien — es importante reconocerlo]

## Hallazgos y Riesgos

### 🔴 Críticos (atender en < 30 días)
1. [Hallazgo] — [Impacto] — [Acción recomendada]

### 🟡 Importantes (atender en < 90 días)
1. [Hallazgo] — [Impacto] — [Acción recomendada]

### 🟢 Mejoras (backlog de mejora continua)
1. [Hallazgo] — [Acción recomendada]

## Plan de Acción Priorizado
[Tabla con: Acción | Prioridad | Esfuerzo estimado | Responsable sugerido]

## Métricas de Seguimiento
[KPIs para medir el progreso de las mejoras]
```

---

## Preguntas de Descubrimiento Adicionales

Si el usuario no provee suficiente contexto, pregunta:
1. ¿Puedes describir el flujo principal del sistema en 3-5 pasos?
2. ¿Cuál ha sido el incidente más reciente? ¿Cuánto tardaron en resolverlo?
3. ¿Qué parte del sistema les da más miedo tocar?
4. ¿Qué tan difícil es hacer un deploy hoy? ¿Cuánto tarda?
5. ¿Qué parte del sistema creció más rápido de lo esperado?
