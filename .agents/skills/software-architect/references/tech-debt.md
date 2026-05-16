# Gestión de Deuda Técnica — Guía de Referencia

## Qué es la Deuda Técnica

La deuda técnica es el costo futuro de trabajo adicional causado por elegir una solución rápida
hoy en lugar de una mejor solución que tomaría más tiempo. Como la deuda financiera, tiene
"intereses" — cuanto más tiempo pasa, más cuesta pagarla.

**No toda deuda técnica es mala.** Tomar deuda conscientemente para acelerar un MVP puede ser
una decisión correcta. El problema es la deuda inconsciente o la que no se gestiona.

---

## Tipos de Deuda Técnica

### Por origen (cuadrante de Ward Cunningham adaptado):

| | Deliberada | Accidental |
|---|---|---|
| **Prudente** | "Shippamos ahora y refactorizamos después" | "Ahora sabemos qué debimos haber hecho" |
| **Imprudente** | "No tenemos tiempo para diseño" | "¿Qué son los patrones de diseño?" |

### Por categoría:
- **Deuda de código**: duplicación, complejidad ciclomática alta, bajo test coverage
- **Deuda de arquitectura**: acoplamiento alto, fronteras de servicio incorrectas
- **Deuda de infraestructura**: configs manuales, dependencias sin actualizar, sin IaC
- **Deuda de documentación**: sistemas sin documentar o con docs desactualizadas
- **Deuda de testing**: código sin tests, tests lentos o frágiles
- **Deuda de seguridad**: dependencias vulnerables, secrets en código, sin cifrado

---

## Identificación y Medición

### Señales de deuda técnica:
- Cada cambio nuevo rompe algo inesperado
- El tiempo de onboarding de nuevos devs es > 2 semanas
- El equipo tiene miedo de cambiar ciertas partes del sistema
- Los bugs recurrentes en las mismas áreas
- Los deployments son manuales o dolorosos
- Las estimaciones son siempre incorrectas (optimista o pesimista)

### Métricas útiles:
- **Cobertura de tests** (target: > 70% en lógica de negocio)
- **Complejidad ciclomática** (alerta si > 10 en funciones críticas)
- **Tiempo de build y deploy** (alerta si > 15 min para CI)
- **Frecuencia de deployments** (< 1/semana es señal de deuda)
- **MTTR** (Mean Time To Recover — cuánto tarda recuperarse de un incidente)
- **Change Failure Rate** (% de deployments que causan incidentes)

---

## Estrategias de Gestión

### 1. Mapa de Deuda Técnica
Crea un inventario visible:

```markdown
| ID | Descripción | Área | Impacto | Esfuerzo | Prioridad |
|----|-------------|------|---------|----------|-----------|
| DT-001 | Lógica de negocio mezclada con controllers | Auth Service | Alto | Medio | P1 |
| DT-002 | Tests de integración ausentes en módulo de pagos | Payments | Alto | Alto | P1 |
| DT-003 | ORM queries N+1 en listado de productos | Catalog | Medio | Bajo | P2 |
| DT-004 | Versión de Node.js desactualizada (v14) | Todos | Bajo | Bajo | P3 |
```

### 2. Regla del Boy Scout
"Deja el código mejor de como lo encontraste". En cada PR, permite pequeñas mejoras
adicionales al cambio principal. No requiere planificación especial.

### 3. Presupuesto de Deuda en el Sprint
Dedica 20% del capacity del equipo a deuda técnica. Esto no es negociable — es inversión
en velocidad futura. Comunícalo al negocio como "salud del sistema".

### 4. Strangler Fig Pattern (para deuda arquitectónica grande)
Para migrar sistemas legados sin reescritura big-bang:
1. Coloca un proxy/facade frente al sistema legacy
2. Implementa las nuevas funcionalidades en el sistema nuevo
3. Migra funcionalidades existentes gradualmente al sistema nuevo
4. Cuando todo esté migrado, elimina el legacy

```
[Request] → [Facade/Proxy] → [Legacy] (mientras migras)
                          ↘ [Nuevo Sistema] (funcionalidades nuevas y migradas)
```

### 5. Módulos Anticorrupción (ACL)
Cuando debes integrar con un sistema legacy o externo con un diseño pobre, crea una
capa anticorrupción que traduzca el modelo externo a tu modelo de dominio limpio.
Evitas que la "corrupción" del modelo externo infecte tu código.

---

## Plan de Reducción de Deuda

Cuando la deuda es significativa, presenta un plan estructurado:

```markdown
## Plan de Reducción de Deuda Técnica

### Situación Actual
[Descripción del estado con métricas]

### Impacto en el Negocio
- Velocidad de desarrollo reducida en ~[X]%
- Incidentes recurrentes costan ~[X] horas/mes
- Onboarding toma [X] semanas en lugar de [Y]

### Iniciativas Propuestas

#### Quick Wins (1-2 semanas cada una):
1. [Iniciativa]: [Descripción breve] — [Impacto estimado]

#### Mejoras Medianas (1-2 sprints):
1. [Iniciativa]: [Descripción breve] — [Impacto estimado]

#### Proyectos Grandes (> 1 mes):
1. [Iniciativa]: [Descripción breve] — [Impacto estimado]

### Métricas de Éxito
[Cómo mediremos que la deuda está reduciéndose]

### Capacidad Requerida
[X]% del capacity del equipo por [Y] meses

### ROI Esperado
[Qué ganamos al invertir esto]
```

---

## Cómo Comunicar la Deuda Técnica al Negocio

El negocio no entiende de "refactoring". Habla su idioma:

❌ "Necesitamos refactorizar el módulo de autenticación"

✅ "El módulo de autenticación tiene un riesgo de seguridad que podría causar una brecha de datos.
   También es la razón por la que cada nueva funcionalidad de login toma 3 semanas en lugar de 3 días.
   Propongo invertir 2 sprints en arreglarlo, lo que reducirá el tiempo de desarrollo de funcionalidades
   de autenticación en un 60%."

**Framework para comunicar:**
1. ¿Cuál es el riesgo si no lo hacemos? (negocio, usuarios, seguridad)
2. ¿Cuánto nos está costando hoy? (tiempo, incidentes, velocidad)
3. ¿Cuánto costará arreglarlo? (sprints, personas)
4. ¿Qué ganamos al arreglarlo? (velocidad, confiabilidad, reducción de riesgo)
