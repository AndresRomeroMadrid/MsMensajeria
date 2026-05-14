import { describe, it, expect } from 'vitest';
import { cleanHtml } from '../utils/string.utils';

/**
 * PRUEBAS UNITARIAS CON VITEST
 * ----------------------------
 * Este archivo contiene pruebas para las utilidades de string.
 * Para ejecutar estas pruebas:
 * 1. Abrir una terminal en la carpeta 'MsMensajeria'
 * 2. Ejecutar: npm test
 */

describe('String Utils - cleanHtml', () => {
  it('debería eliminar etiquetas HTML básicas', () => {
    const html = '<p>Hola Mundo</p>';
    const expected = 'Hola Mundo';
    expect(cleanHtml(html)).toBe(expected);
  });

  it('debería eliminar múltiples etiquetas anidadas', () => {
    const html = '<div><h1>Título</h1><p>Texto con <b>negrita</b></p></div>';
    const expected = 'TítuloTexto con negrita';
    expect(cleanHtml(html)).toBe(expected);
  });

  it('debería devolver un string vacío si la entrada es nula o vacía', () => {
    expect(cleanHtml('')).toBe('');
    // @ts-ignore
    expect(cleanHtml(null)).toBe('');
  });

  it('debería mantener el texto si no hay etiquetas', () => {
    const text = 'Texto plano sin HTML';
    expect(cleanHtml(text)).toBe(text);
  });
});
