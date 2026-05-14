/**
 * Utilidades para manipulación de strings
 */

/**
 * Limpia las etiquetas HTML de un string
 * @param html String con contenido HTML
 * @returns String sin etiquetas HTML
 */
export const cleanHtml = (html: string): string => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
};
