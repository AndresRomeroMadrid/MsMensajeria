import { describe, it, expect } from 'vitest';
import { cleanHtml } from '../../../src/utils/string.utils';

describe('String Utils - cleanHtml', () => {
  it('debería eliminar etiquetas HTML básicas', () => {
    expect(cleanHtml('<p>Hola Mundo</p>')).toBe('Hola Mundo');
  });

  it('debería eliminar múltiples etiquetas anidadas', () => {
    expect(cleanHtml('<div><h1>Título</h1><p>Texto con <b>negrita</b></p></div>')).toBe('TítuloTexto con negrita');
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
