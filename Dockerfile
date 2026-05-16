# --- ETAPA 1: Construcción (Compilar TypeScript) ---
FROM public.ecr.aws/lambda/nodejs:22 AS builder

# Directorio de trabajo para la compilación
WORKDIR /usr/app

# Copiar archivos de dependencias
COPY package*.json ./
COPY tsconfig.json ./

# Instalar todas las dependencias (incluyendo las de desarrollo para compilar)
RUN npm install

# Copiar el código fuente
COPY . .

# Compilar TypeScript a JavaScript (genera la carpeta dist/)
RUN npm run build


# --- ETAPA 2: Producción (Imagen final para Lambda) ---
FROM public.ecr.aws/lambda/nodejs:22

# El directorio de trabajo en la imagen de Lambda es una variable predefinida
WORKDIR ${LAMBDA_TASK_ROOT}

# Copiar solo los archivos compilados desde la etapa anterior
COPY --from=builder /usr/app/dist ./dist

# Copiar package.json para instalar solo dependencias de producción
COPY --from=builder /usr/app/package*.json ./

# Instalar solo dependencias necesarias para ejecutar (omite devDependencies)
RUN npm install --omit=dev

# Configurar el comando de ejecución
# Formato: [ "archivo.función" ]
# Según tu spec, el archivo es dist/index.js y la función exportada suele llamarse 'handler'
CMD [ "dist/index.handler" ]
