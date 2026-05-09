export interface Mensaje {
  id?: number;
  quien_envia: string;
  quien_recibe: string;
  fecha_hora?: Date;
  asunto: string;
  cuerpo_mensaje: string;
  id_archivo_adjunto?: string; // Aquí guardaremos la ruta + nombre según instrucción
  leido: boolean;
}
