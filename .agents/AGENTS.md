Este microservicio se trata sobre la mensajeria del colegio


## Consideraciones

- Antes de ejecutar un spec dentro de la carpeta `specs/` es necesario echar un vistazo a la carpeta `context/` para saber que se esta construyendo.

- No instalar dependencias sin preguntar primero.

- Utilizar las skills necesarias para lograr la tarea

- Follow the Spec Drive Development
- No implementes codigo a no ser que el spec este aprobado en .agents/specs/
- Para cada nuevo spec debe de existir:
    spec.md
    design.md
    task.md

# Como trabajar el SDD:

crear un spec dentro de `specs/` con esta estructura

```
/specs/
  login-with-google/
    spec.md
    design.md
    tasks.md
```

el mas importante es el `spec.md`
ejemplo:

```    
# Spec: Login with Google

## Objetivo
Permitir que usuarios inicien sesión usando Google OAuth.

## Alcance
- Agregar botón "Continuar con Google" en la pantalla de login.
- Crear endpoint de callback OAuth.
- Crear o actualizar usuario si el email ya existe.
- Guardar sesión usando el mecanismo actual del proyecto.

## Fuera de alcance
- Login con Facebook.
- Registro manual.
- Cambio del sistema actual de sesiones.

## Reglas de negocio
- Si el email ya existe, vincular la cuenta de Google al usuario existente.
- Si el usuario está bloqueado, no permitir login.
- Si Google no devuelve email verificado, rechazar login.

## Criterios de aceptación
- Dado un usuario nuevo con email verificado, cuando inicia sesión con Google, entonces se crea su cuenta.
- Dado un usuario existente, cuando inicia sesión con Google, entonces accede a su cuenta actual.
- Dado un email no verificado, cuando intenta iniciar sesión, entonces recibe error.
- El build debe pasar.
- Los tests relacionados deben pasar.
```

Pedir a codex que revise el spec
ejemplo de prompt: 
```
Lee /specs/login-with-google/spec.md y revisa si falta información antes de implementar.

No escribas código todavía.

Devuélveme:
1. Preguntas abiertas
2. Riesgos técnicos
3. Supuestos que estás haciendo
4. Casos borde faltantes
5. Cambios sugeridos a la spec
```

Cuando la spec este clara:
```
A partir de /specs/login-with-google/spec.md, crea /specs/login-with-google/design.md.

Incluye:
- Archivos que probablemente se modificarán
- Arquitectura propuesta
- Flujo de datos
- Cambios en base de datos, si aplica
- Dependencias nuevas, si aplica
- Riesgos
- Estrategia de testing

No implementes código todavía.
```

Generar tareas pequenas:

```
A partir de spec.md y design.md, crea /specs/login-with-google/tasks.md.

Divide la implementación en tareas pequeñas, revisables y en orden.

Cada tarea debe incluir:
- Objetivo
- Archivos esperados
- Tests requeridos
- Criterio de finalización
```

Ejemplo de task.md:

```
# Tasks: Login with Google

## Task 1: Configurar variables de entorno
- Agregar GOOGLE_CLIENT_ID
- Agregar GOOGLE_CLIENT_SECRET
- Documentar en .env.example

## Task 2: Crear servicio OAuth
- Crear servicio para validar respuesta de Google
- Manejar email no verificado
- Agregar tests unitarios

## Task 3: Crear endpoint callback
- Procesar respuesta OAuth
- Crear o vincular usuario
- Crear sesión

## Task 4: Agregar botón en frontend
- Mostrar botón en login
- Redirigir a flujo OAuth

## Task 5: Validación final
- Ejecutar npm run build
- Ejecutar npm test
- Revisar que no haya cambios fuera de alcance
```

En este caso solo actuaras como orquestador ya que otros agentes se encargaran de ejecutar las tareas
