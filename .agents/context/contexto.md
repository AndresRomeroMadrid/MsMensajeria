# Caso Semestral: "Colegio Bernardo O’Higgins – Plataforma de libro de clases digital"

El uso de tecnologías digitales en el ámbito educativo se ha vuelto cada vez más necesario para
la labor académica, los establecimientos no pueden quedarse atrás y requieren la
incorporación de tecnologías en el proceso educativo.

Muchos establecimientos aún utilizan libros de clases físicos o implementan soluciones
fragmentadas mediante sistemas digitales, plataformas como servicio en la nube, dificultando
mantener información actualizada y acceder a la información histórica de las actividades
académicas.

El Colegio Bernardo O’Higgins de Coquimbo es una institución educativa que imparte
enseñanza básica y media, atendiendo a una comunidad educativa de estudiantes,
profesores, apoderados y personal administrativo.

Con el objetivo de modernizar sus procesos administrativos y académicos el colegio ha
decidido impulsar el desarrollo de una plataforma digital que funcione como un libro de clases
electrónico, permitiendo registrar, consultar y analizar información académica en un entorno
digital seguro y accesible.

El desarrollo de este sistema se llevará a cabo en tres etapas, alineadas con las evaluaciones
parciales del curso. Finalmente, en el Examen Final Transversal, los/as estudiantes
consolidarán su solución integrando todos los módulos desarrollados en un sistema
funcional.

## Sección 1: Diseño de Arquitectura y Patrones de Microservicios (Parcial 1)

### Contexto

El Colegio Bernardo O’Higgins busca implementar un sistema digital que permita gestionar de
manera centralizada la información académica relacionada con los cursos y estudiantes del
establecimiento.

Actualmente, la institución enfrenta diversas dificultades destacando los siguientes
problemas:

* Dependencia del libro de clases físico para registrar información académica
* Dificultad para consultar información histórica de estudiantes
* Falta de herramientas que permitan analizar el desempeño académico
* Escasa comunicación entre docentes, estudiantes y apoderados
* Procesos administrativos lentos para generar reportes institucionales.

Para mejorar esta situación, el establecimiento ha decidido desarrollar una plataforma de libro
de clases digital, que permita centralizar la información académica y facilitar el acceso a los
distintos actores del proceso educativo

La solución debe contemplar tres módulos principales:
* Sistema de gestión académica: Permite a los responsables gestionar la información
de asignaturas, cursos y evaluaciones, facilitando el seguimiento del rendimiento
académico de los estudiantes.

* Sistema de registro de asistencia y anotaciones: Permite registrar información
relacionada con la asistencia y conducta de los estudiantes. Lo que logrará mantener
un registro estructurado del comportamiento y participación de estudiantes.

* Portal de comunicaciones y mensajería: Permite facilitar la comunicación entre los
distintos actores de la comunidad, facilitando el envío de mensajes entre el
establecimiento, docentes, apoderados y estudiantes.

### Requerimientos Técnicos

Los/as estudiantes deberán diseñar una arquitectura de microservicios escalable,
aplicando patrones de diseño y arquetipos arquitectónicos que permitan la modularización
del sistema. Para ello, deberán:

* Definir los microservicios clave, asegurando separación de responsabilidades y
escalabilidad.
* Diseñar una API Gateway que gestione la comunicación entre microservicios y el
rontend.
* Implementar patrones como Repository Pattern para la persistencia de datos,
Factory Method para la creación de instancias y Circuit Breaker para manejar fallos
en la comunicación entre servicios.
* Asegurar que los servicios sean escalables y desacoplados, permitiendo futuras
mejoras sin afectar el funcionamiento del sistema.
* Documentar las decisiones arquitectónicas y justificar la selección de patrones.
Al finalizar esta etapa, los equipos deberán presentar un informe con la propuesta de
arquitectura, un diagrama detallado de los microservicios y una justificación de los patrones
seleccionados.

## Sección 2: Desarrollo de Componentes Frontend y Backend (Parcial 2)

**Contexto**
Después de definir la arquitectura del sistema, el Colegio Bernardo O’Higgins busca
desarrollar una primera versión funcional que permita validar la propuesta tecnológica. La
institución requiere un sistema que cuente con una interfaz de usuario intuitiva y responsiva.
El backend debe ser capaz de procesar volúmenes de datos sin comprometer el rendimiento.

**Requerimientos Técnicos**
Los/as estudiantes deberán desarrollar la solución con los siguientes elementos clave:

* Frontend: Implementar una interfaz construida con un framework moderno (React,    Angular o Vue.js), asegurando que la comunicación con el backend se realice vía API    REST. Los componentes frontend deberán ser empaquetados como módulos NPM reutilizables.

* Backend: Construir al menos tres componentes backend utilizando arquetipos
  Maven personalizados:
	 o Un Backend For Frontend (BFF) para gestionar la interacción entre el frontend y los
	   microservicios.
	 o Dos microservicios independientes, conectados a bases de datos mediante JPA.
	
* Conexión con Bases de Datos: Utilizar JPA y entidades, asegurando la persistencia de datos. También se podrán utilizar procedimientos almacenados (SPs) para optimizar  operaciones.

* Versionamiento del Código: Todos los componentes deberán ser versionados en Git,
  utilizando estrategias de branching como Git Flow o GitHub Flow para facilitar el trabajo
  colaborativo.

* Implementación de Patrones de Diseño: Aplicar patrones adecuados para mejorar la
  organización y mantenibilidad del código, asegurando que los servicios sean
  modulares y fácilmente extensibles.

Como resultado de esta etapa, los/as estudiantes deberán entregar la primera versión
funcional del sistema, acompañada de una presentación donde expliquen las decisiones
técnicas, la implementación de los componentes y la integración entre frontend y backend.

