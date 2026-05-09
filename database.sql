-- Script para crear la tabla de mensajería (PostgreSQL)
-- Basado en la estructura solicitada y ajustado para guardar rutas de archivos

CREATE TABLE IF NOT EXISTS mensajeria (
    id SERIAL PRIMARY KEY,
    quien_envia VARCHAR(150) NOT NULL,
    quien_recibe VARCHAR(150) NOT NULL,
    fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    asunto VARCHAR(255) NOT NULL,
    cuerpo_mensaje TEXT,
    -- Cambiamos id_archivo_adjunto de UUID a TEXT para guardar la ruta solicitada
    id_archivo_adjunto TEXT, 
    leido BOOLEAN DEFAULT FALSE
);

-- Si la tabla ya existe y quieres cambiar el tipo de la columna id_archivo_adjunto:
-- ALTER TABLE mensajeria ALTER COLUMN id_archivo_adjunto TYPE TEXT;
