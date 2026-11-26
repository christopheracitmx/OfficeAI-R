import { describe, expect, it } from 'vitest';
import { nombreNorm, telefonoNorm, webNorm } from '../src/server/fuentes/normalizar';
import { esGobierno, estratoDe, giroDeScian, tamanoDePersonal } from '../src/server/fuentes/scian';
import { resolverZona } from '../src/server/fuentes/zona-filtro';

describe('P11 normalización, SCIAN y zona', () => {
  it('normaliza nombres, teléfonos y sitios; una red social no es el sitio de la empresa', () => {
    expect(nombreNorm('Aceros del Valle, S.A. de C.V.')).toBe('aceros del valle');
    expect(nombreNorm('ACEROS  DEL VALLE SA DE CV')).toBe('aceros del valle');
    expect(telefonoNorm('+52 (55) 5555-0101')).toBe('5555550101');
    expect(telefonoNorm('123')).toBeUndefined();
    expect(webNorm('www.acme.example')).toBe('https://www.acme.example/');
    expect(webNorm('https://www.facebook.com/acme')).toBeUndefined();
    expect(webNorm('https://instagram.com/acme')).toBeUndefined();
  });

  it('estrato, giro, tamaño y gobierno', () => {
    expect(estratoDe('11 a 30 personas')).toBe(3);
    expect(estratoDe('251 y más personas')).toBe(7);
    expect(estratoDe('0 a 5 personas')).toBe(1);
    expect(estratoDe('4')).toBe(4);
    expect(giroDeScian('331111')).toBe('Manufactura');
    expect(giroDeScian('5415')).toBe('Tecnología y telecomunicaciones');
    expect(giroDeScian('484110')).toBe('Logística y transporte');
    expect(tamanoDePersonal(51)).toBe('mediana');
    expect(esGobierno('Cualquier cosa', '931210')).toBe(true);
    expect(esGobierno('Ayuntamiento de Toluca', null)).toBe(true);
    expect(esGobierno('Aceros SA', '331111')).toBe(false);
  });

  it('interpreta la zona de la corrida', () => {
    expect(resolverZona('CDMX Norte')).toEqual({
      estados: ['CDMX'],
      municipios: ['Azcapotzalco', 'Gustavo A. Madero'],
    });
    expect(resolverZona('Edomex - Naucalpan de Juárez')).toEqual({
      estados: ['Estado de México'],
      municipios: ['Naucalpan de Juárez'],
    });
    expect(resolverZona('Estado de México').municipios).toEqual([]);
    expect(resolverZona('Cualquiera').estados).toEqual(['CDMX', 'Estado de México']);
  });
});
