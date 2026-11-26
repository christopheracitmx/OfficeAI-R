import type { Db } from '../db';
import { leerSeleccion } from '../services/motor-seleccion';
import { crearAdaptadorApi } from './adaptador-api';
import { claveDe } from './proveedores';
import type { ContextoMotor, EjecutarAgenteFn } from './types';

/**
 * Elige el motor de CADA llamada según lo que el dueño seleccionó en Configuración/Corrida.
 * Selección manual: si el proveedor elegido se agota o falla, NO cambia solo (eso viene después, con datos de pruebas).
 */
export function crearDespachador(o: {
  db: Db;
  env: NodeJS.ProcessEnv;
  ctx: ContextoMotor;
  claude: EjecutarAgenteFn;
  fetchFn?: typeof fetch;
}): EjecutarAgenteFn {
  return (i) => {
    const sel = leerSeleccion(o.db);
    if (sel.proveedor === 'claude') return o.claude(i);
    if (!claveDe(o.env, sel.proveedor))
      return Promise.resolve({
        ok: false,
        salida: '',
        error: `El motor elegido (${sel.proveedor}) no tiene llave en crm\.env`,
      });
    if (!sel.modelo)
      return Promise.resolve({
        ok: false,
        salida: '',
        error: `Falta elegir el modelo de ${sel.proveedor} en Configuración → Motor de IA`,
      });
    return crearAdaptadorApi(o.ctx, sel, o.env, o.fetchFn)(i);
  };
}
