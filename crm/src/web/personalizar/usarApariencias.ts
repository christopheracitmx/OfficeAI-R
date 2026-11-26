/**
 * Estado del Personalizador. Las ediciones van a un BORRADOR local (la vista previa 3D se recompone al
 * instante con el mismo código que el servidor) y se guardan solas, como UNA versión, 700 ms después
 * de la última. Deshacer/Rehacer recorren las versiones guardadas (o descartan el borrador pendiente).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rngSemilla } from '../../shared/oficina3d/aleatorio';
import { campoAleatorio } from '../../shared/oficina3d/aleatorio-lugares';
import {
  ErrorComposicion,
  clave,
  componerDefinicion,
  type Campos,
  type Capas,
  type Entidad,
} from '../../shared/oficina3d/composicion';
import type { DefinicionOficina } from '../../shared/oficina3d/definicion';
import { useToast } from '../components/ui';
import { api } from '../lib/api';
import type { EstadoApariencias, PresetUi } from '../lib/types-apariencia';
import { compartir } from '../oficina3d/compartir';

interface CapaBorrador {
  preset: number | null;
  overrides: Campos;
}
const ESPERA_MS = 700;

export function useApariencias() {
  const toast = useToast();
  const [estado, setEstado] = useState<EstadoApariencias | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Record<string, CapaBorrador>>({});
  const [comparando, setComparando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(0);
  const bRef = useRef(borrador);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const cargar = useCallback(async () => {
    try {
      setEstado(await api<EstadoApariencias>('/apariencias'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    }
  }, []);
  useEffect(() => {
    let vivo = true;
    api<EstadoApariencias>('/apariencias')
      .then((e) => {
        if (!vivo) return;
        setEstado(e);
        setError(null);
      })
      .catch(
        (e: unknown) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar'),
      );
    return () => {
      vivo = false;
    };
  }, []);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((x) => clearTimeout(x));
  }, []);

  const presetsPorId = useMemo(
    () => new Map<number, PresetUi>((estado?.presets ?? []).map((p) => [p.id, p])),
    [estado],
  );

  /** Capas (guardadas + borrador) con el preset resuelto, listas para componer. */
  const capasVista = useMemo((): Capas => {
    const r: Record<string, { preset: Campos | null; overrides: Campos }> = {};
    const poner = (k: string, c: CapaBorrador) => {
      r[k] = {
        preset: c.preset === null ? null : (presetsPorId.get(c.preset)?.json ?? null),
        overrides: c.overrides,
      };
    };
    for (const [k, c] of Object.entries(estado?.capas ?? {})) poner(k, c);
    for (const [k, c] of Object.entries(borrador)) poner(k, c);
    if (comparando) delete r[comparando];
    return r;
  }, [estado, borrador, presetsPorId, comparando]);

  const nueva = useMemo(
    () => (estado ? componerDefinicion(estado.base, capasVista) : null),
    [estado, capasVista],
  );
  const [estable, setEstable] = useState<{
    fuente: DefinicionOficina | null;
    def: DefinicionOficina | null;
  }>({ fuente: null, def: null });
  const fuente = nueva?.def ?? null;
  if (estable.fuente !== fuente)
    setEstable({ fuente, def: fuente ? compartir(estable.def, fuente) : null });
  const def = estable.def;

  /** Motivo por el que el borrador de una entidad no se puede guardar (plano inválido, etc.). */
  const errores = useMemo(() => {
    const r: Record<string, string> = {};
    if (!estado) return r;
    for (const k of Object.keys(borrador)) {
      try {
        componerDefinicion(estado.base, capasVista, true);
      } catch (e) {
        if (e instanceof ErrorComposicion) r[k] = e.message;
      }
    }
    return r;
  }, [estado, borrador, capasVista]);
  const erroresRef = useRef(errores);
  useEffect(() => {
    erroresRef.current = errores;
  }, [errores]);

  const guardada = useCallback(
    (k: string): CapaBorrador => {
      const g = estado?.capas[k];
      return { preset: g?.preset ?? null, overrides: g?.overrides ?? {} };
    },
    [estado],
  );
  const actual = useCallback(
    (e: Entidad, id: string): CapaBorrador => bRef.current[clave(e, id)] ?? guardada(clave(e, id)),
    [guardada],
  );

  const quitar = (k: string) => {
    const resto = { ...bRef.current };
    delete resto[k];
    bRef.current = resto;
    setBorrador(resto);
  };

  const guardarYa = useCallback(
    async (e: Entidad, id: string) => {
      const k = clave(e, id);
      clearTimeout(timers.current.get(k));
      const c = bRef.current[k];
      if (!c) return;
      if (erroresRef.current[k]) return; // plano inválido: el borrador queda a la vista para corregirlo
      setGuardando((n) => n + 1);
      try {
        await api(`/apariencias/${e}/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: { preset: c.preset, overrides: c.overrides },
        });
        await cargar();
        if (bRef.current[k] === c) quitar(k);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'No se pudo guardar', 'error');
        quitar(k);
        await cargar();
      } finally {
        setGuardando((n) => n - 1);
      }
    },
    [cargar, toast],
  );

  const poner = useCallback(
    (e: Entidad, id: string, c: CapaBorrador) => {
      const k = clave(e, id);
      bRef.current = { ...bRef.current, [k]: c };
      setBorrador(bRef.current);
      clearTimeout(timers.current.get(k));
      timers.current.set(
        k,
        setTimeout(() => void guardarYa(e, id), ESPERA_MS),
      );
    },
    [guardarYa],
  );

  const editar = useCallback(
    (e: Entidad, id: string, cambios: Campos, quitarCampos: string[] = []) => {
      const c = actual(e, id);
      const overrides = { ...c.overrides, ...cambios };
      for (const q of quitarCampos) delete overrides[q];
      poner(e, id, { preset: c.preset, overrides });
    },
    [actual, poner],
  );

  const post = useCallback(
    async (ruta: string, body?: object) => {
      setGuardando((n) => n + 1);
      try {
        await api(ruta, { method: 'POST', body: body ?? {} });
        await cargar();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'No se pudo completar', 'error');
        await cargar();
      } finally {
        setGuardando((n) => n - 1);
      }
    },
    [cargar, toast],
  );

  /** Acción sobre la versión guardada de una entidad; antes se guarda el borrador pendiente. */
  const accion = useCallback(
    async (e: Entidad, id: string, nombre: string, body?: object) => {
      await guardarYa(e, id);
      quitar(clave(e, id));
      await post(`/apariencias/${e}/${encodeURIComponent(id)}/${nombre}`, body);
    },
    [guardarYa, post],
  );

  const deshacer = useCallback(
    async (e: Entidad, id: string) => {
      const k = clave(e, id);
      if (bRef.current[k]) {
        clearTimeout(timers.current.get(k));
        quitar(k); // descarta lo que aún no se guardaba
        return;
      }
      await accion(e, id, 'deshacer');
    },
    [accion],
  );

  const aleatorioCampo = useCallback(
    (e: Entidad, id: string, campo: string, actualEfectivo: Campos) => {
      const v = campoAleatorio(
        e,
        campo,
        rngSemilla(Math.floor(Math.random() * 2 ** 32)),
        actualEfectivo,
      );
      if (v !== undefined) editar(e, id, { [campo]: v });
    },
    [editar],
  );

  const aplicarPreset = useCallback(
    (e: Entidad, id: string, presetId: number) => {
      const p = presetsPorId.get(presetId);
      if (!p) return;
      const c = actual(e, id);
      const overrides = { ...c.overrides };
      for (const k of Object.keys(p.json)) delete overrides[k]; // el preset manda sobre lo anterior
      poner(e, id, { preset: presetId, overrides });
    },
    [actual, poner, presetsPorId],
  );

  return {
    estado,
    error,
    def,
    base: estado?.base ?? null,
    descartes: nueva?.descartes ?? [],
    presets: estado?.presets ?? [],
    capas: estado?.capas ?? {},
    borrador,
    errores,
    guardando: guardando > 0 || Object.keys(borrador).length > 0,
    comparando,
    setComparando,
    cargar,
    actual,
    editar,
    deshacer,
    rehacer: (e: Entidad, id: string) => accion(e, id, 'rehacer'),
    restablecer: (e: Entidad, id: string) => accion(e, id, 'restablecer'),
    aleatorio: (e: Entidad, id: string) =>
      accion(e, id, 'aleatorio', { semilla: Math.floor(Math.random() * 2 ** 32) }),
    restaurar: (e: Entidad, id: string, version: number) => accion(e, id, 'restaurar', { version }),
    aleatorioCampo,
    aplicarPreset,
    equipo: (acc: string) =>
      post('/apariencias/equipo', { accion: acc, semilla: Math.floor(Math.random() * 2 ** 32) }),
    post,
    presetsPorId,
  };
}
export type Personalizador = ReturnType<typeof useApariencias>;
