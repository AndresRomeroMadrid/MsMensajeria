# Evaluación de Tecnologías — Guía de Referencia

## Framework de Evaluación Tecnológica

Usa este framework para evaluar lenguajes, frameworks, bases de datos, plataformas, o cualquier
decisión de stack tecnológico.

---

## Dimensiones de Evaluación

### 1. Alineación con el Problema
- ¿La tecnología resuelve el problema real?
- ¿Fue diseñada para este tipo de caso de uso?
- ¿Hay casos de éxito documentados en contextos similares?

### 2. Madurez y Estabilidad
| Señal | Indica |
|-------|--------|
| Versión > 1.0, changelog activo | Madurez |
| Empresa/fundación de respaldo | Longevidad |
| Comunidad activa (GitHub stars, issues respondidos) | Soporte |
| Adoptado por empresas reconocidas | Validación |
| CVEs recientes sin parchear | Riesgo de seguridad |

### 3. Performance y Escalabilidad
- ¿Existen benchmarks públicos para el caso de uso?
- ¿Escala horizontalmente? ¿Qué tan bien?
- ¿Cuáles son los límites conocidos?

### 4. Curva de Aprendizaje y Talento
- ¿El equipo tiene experiencia con esta tecnología?
- ¿Es fácil contratar personas con este skill?
- ¿La documentación es buena?
- ¿Cuánto tiempo tomaría al equipo ser productivo?

### 5. Ecosistema e Integración
- ¿Tiene buenas librerías / plugins para los casos de uso comunes?
- ¿Se integra bien con el stack existente?
- ¿Tiene SDKs para los lenguajes del equipo?

### 6. Costo Total de Propiedad (TCO)
- Licencia: ¿Open source, comercial, freemium?
- Operación: ¿Managed service o self-hosted? ¿Costo de infraestructura?
- Soporte: ¿Hay soporte comercial disponible?
- Migración: ¿Cuánto costaría migrar si la decisión fue incorrecta?

### 7. Riesgo de Vendor Lock-in
- ¿Es un estándar abierto o propietario?
- ¿Hay alternativas equivalentes si necesitas migrar?
- ¿Los datos son exportables en formato estándar?

---

## Plantilla de Evaluación Comparativa

```
## Evaluación Técnica: [Problema a resolver]
Fecha: [fecha]
Evaluador: [nombre]

### Contexto
[Descripción del problema y requerimientos clave]

### Opciones Evaluadas
1. [Tecnología A]
2. [Tecnología B]
3. [Tecnología C] (opcional: status quo / no hacer nada)

### Matriz de Evaluación

| Criterio           | Peso | Tecnología A | Tecnología B | Tecnología C |
|--------------------|------|-------------|-------------|-------------|
| Alineación         | 25%  | 8/10        | 7/10        | 5/10        |
| Madurez            | 20%  | 9/10        | 6/10        | 8/10        |
| Performance        | 20%  | 7/10        | 9/10        | 6/10        |
| Talento            | 15%  | 8/10        | 5/10        | 9/10        |
| Ecosistema         | 10%  | 8/10        | 7/10        | 7/10        |
| Costo              | 10%  | 6/10        | 7/10        | 8/10        |
| **Score Total**    |      | **7.8**     | **6.9**     | **6.7**     |

### Análisis por Opción

#### [Tecnología A]
✅ Fortalezas: ...
❌ Debilidades: ...
📌 Mejor cuando: ...

#### [Tecnología B]
...

### Recomendación
[Tecnología elegida] por las siguientes razones:
1. [Razón 1]
2. [Razón 2]

### Condiciones de Revisión
Esta decisión debería revisarse si:
- [Condición 1, ej: el equipo crece a más de X personas]
- [Condición 2, ej: el volumen supera X transacciones/seg]

### Plan de Prueba de Concepto (si aplica)
[Qué validar, cómo, en cuánto tiempo, criterios de éxito/fracaso]
```

---

## Errores Comunes en Evaluaciones Tecnológicas

### Sesgos a evitar:
- **Hype-driven**: elegir tecnología porque está de moda, no porque resuelve el problema
- **Resume-driven**: elegir para aprender, no para el proyecto
- **Not-invented-here**: rechazar soluciones probadas por querer construir internamente
- **Sunk cost**: seguir con una tecnología incorrecta porque ya se invirtió tiempo

### Señales de alerta en una tecnología:
- Documentación pobre o desactualizada
- Issues críticos sin respuesta en GitHub por semanas
- Empresa detrás con problemas financieros
- Breaking changes frecuentes sin deprecation notice
- Comunidad pequeña y decreciente

---

## Decisiones de Stack Comunes

### Backend
- **Alto throughput, I/O bound**: Node.js, Go, Rust
- **Productividad y ecosistema**: Python, Ruby, Java/Kotlin, C#
- **Performance crítica**: Go, Rust, C++
- **Data processing**: Python (pandas, spark), Scala (Spark)

### Frontend
- **SPA modernas**: React, Vue, Angular (según equipo)
- **Performance y SEO**: Next.js, Nuxt, Astro
- **Mobile**: React Native (cross-platform), Flutter (cross-platform), nativo (máxima performance)

### Orquestación y Deployment
- **Contenedores**: Docker (estándar de facto)
- **Orquestación**: Kubernetes (escala enterprise), Docker Compose (desarrollo/small scale)
- **Serverless**: AWS Lambda, Google Cloud Functions (para workloads event-driven)
- **PaaS**: Railway, Render, Fly.io (para equipos pequeños que priorizan productividad)

### Mensajería
- **Alto volumen, durabilidad**: Apache Kafka
- **Flexibilidad, menor complejidad**: RabbitMQ
- **Ecosistema AWS**: SQS + SNS
- **Simplicidad**: Redis Streams (para casos simples)
