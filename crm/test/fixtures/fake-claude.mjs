// CLI simulado que imita `claude -p --output-format stream-json` para probar el runner sin gastar plan.
// Hace lo que haría el agente real: llama al CRM por HTTP (API de agentes) según CRM_AGENT y CRM_TOOLS.
// Escenario por archivo JSON en FAKE_SCENARIO; bitácora de invocaciones en FAKE_LOG.
import { appendFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const val = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const escenario = process.env.FAKE_SCENARIO
  ? JSON.parse(readFileSync(process.env.FAKE_SCENARIO, 'utf8'))
  : {};

// Llamadas SIN herramientas (reflexión/evaluación): no hay --mcp-config. Escenario: `reflexion`, `evaluacion`, `libre_segun_prompt`.
if (!val('--mcp-config')) {
  const msg = readFileSync(0, 'utf8');
  const sistema = val('--system-prompt') ?? '';
  if (process.env.FAKE_LOG)
    appendFileSync(
      process.env.FAKE_LOG,
      JSON.stringify({
        libre: true,
        mensaje: msg,
        prompt: sistema,
        modelo: val('--model'),
        esfuerzo: val('--effort'),
        herramientas: val('--allowedTools') ?? null,
      }) + '\n',
    );
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  out({ type: 'system', subtype: 'init', mcp_servers: [] });
  if (escenario.plan_libre !== undefined) {
    const r = Math.floor(Date.now() / 1000) + 3 * 3600;
    out({
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'allowed',
        resetsAt: r,
        rateLimitType: 'five_hour',
        unifiedWindows: {
          five_hour: { utilization: escenario.plan_libre, resetsAt: r, status: 'allowed' },
        },
      },
    });
  }
  const segun = (escenario.libre_segun_prompt ?? []).find(
    (x) => sistema.includes(x.contiene) || msg.includes(x.contiene),
  );
  const esReflexion = sistema.includes('REFLEXION_DE_OFICINA');
  const salida = segun
    ? segun.salida
    : esReflexion
      ? (escenario.reflexion ?? '{"propuestas":[],"fusiones":[]}')
      : (escenario.evaluacion ?? '{}');
  const texto = typeof salida === 'string' ? salida : JSON.stringify(salida);
  out({ type: 'assistant', message: { content: [{ type: 'text', text: texto }] } });
  out({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: texto,
    num_turns: 1,
    usage: {
      input_tokens: 50,
      cache_creation_input_tokens: 400,
      cache_read_input_tokens: 0,
      output_tokens: 120,
    },
  });
  process.exit(0);
}
const mcp = JSON.parse(readFileSync(val('--mcp-config'), 'utf8')).mcpServers['acitmx-crm'];
const env = mcp.env;
const agente = env.CRM_AGENT;
const herramientas = (env.CRM_TOOLS ?? '').split(',');
const mensaje = readFileSync(0, 'utf8');
const token = readFileSync(env.CRM_AGENT_TOKEN_FILE, 'utf8').trim();

const log = (o) =>
  process.env.FAKE_LOG && appendFileSync(process.env.FAKE_LOG, JSON.stringify(o) + '\n');
log({
  agente,
  pid: process.pid,
  mensaje,
  herramientas,
  modelo: val('--model'),
  esfuerzo: val('--effort'),
  maxTurns: val('--max-turns'),
  placesKey: env.GOOGLE_PLACES_API_KEY,
  prompt: val('--system-prompt'),
});

const emit = (o) =>
  process.stdout.write(`${JSON.stringify(o)}
`);
emit({
  type: 'system',
  subtype: 'init',
  mcp_servers: [{ name: 'acitmx-crm', status: 'connected' }],
});

async function api(method, ruta, body) {
  const r = await fetch(`${env.CRM_URL}/api/agent${ruta}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-agent-token': token, 'x-agent-name': agente },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

function terminar(texto, extra = {}) {
  emit({ type: 'assistant', message: { content: [{ type: 'text', text: texto }] } });
  emit({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: texto,
    num_turns: 2,
    usage: {
      input_tokens: 10,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 0,
      output_tokens: 20,
    },
    ...extra,
  });
  process.exit(0);
}

function fallar(texto, extra = {}, code = 1) {
  emit({
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    result: texto,
    ...extra,
  });
  process.exit(code);
}

const num = (re) => Number(re.exec(mensaje)?.[1] ?? 0);
const sufijo = () => Math.random().toString(36).slice(2, 8);

// Ventanas del plan como las emite el CLI real: `plan` fija el % de la ventana de 5 h para todos los
// agentes y `plan_por_agente` lo fija por agente (0..1). `credito` simula un modelo que exige créditos.
const uso5h = escenario.plan_por_agente?.[agente] ?? escenario.plan;
if (uso5h !== undefined) {
  const reinicio = Math.floor(Date.now() / 1000) + 3 * 3600;
  emit({
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'allowed',
      resetsAt: reinicio,
      rateLimitType: 'five_hour',
      unifiedWindows: {
        five_hour: { utilization: uso5h, resetsAt: reinicio, status: 'allowed' },
        seven_day: {
          utilization: escenario.semanal ?? 0.1,
          resetsAt: reinicio + 86400,
          status: 'allowed',
        },
      },
    },
  });
}
if (escenario.credito === agente) {
  emit({
    type: 'rate_limit_event',
    rate_limit_info: { status: 'rejected', errorCode: 'credits_required', resetsAt: 1796083200 },
  });
  fallar('Fable 5.2 requires usage credits', { api_error_status: 429 });
}
if (escenario.limite === agente) {
  emit({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 1795644000 } });
  fallar('Claude AI usage limit reached', { api_error_status: 429 });
}
if (escenario.error === agente) fallar('Fallo simulado del motor', { api_error_status: 500 });
if (escenario.colgar === agente) setInterval(() => undefined, 1000);
else {
  const empresaId = num(/empresa_id=(\d+)/);
  const prospectoId = num(/prospecto_id=(\d+)/);
  if (agente === 'Cartografo' || agente === 'Explorador') {
    const faltan = num(/faltan=(\d+)/);
    const crear = Math.min(faltan, escenario[agente] ?? faltan);
    const nuevas = [];
    for (let i = 0; i < crear; i++) {
      const r = await api('POST', '/empresas', {
        nombre: `Empresa ${agente} ${sufijo()} SA`,
        metodo_descubrimiento: agente === 'Cartografo' ? 'places' : 'nicho_web',
        ...(agente === 'Cartografo'
          ? { place_id: `pid-${sufijo()}` }
          : { origen_url: 'https://dir.example.mx/lista' }),
        origen_nota: 'simulado',
        direccion: 'Av. Insurgentes Sur 100, Benito Juárez, CDMX, 03100',
      });
      nuevas.push(r?.id);
    }
    if (agente === 'Cartografo' && escenario.cuota) {
      emit({
        type: 'user',
        message: { content: [{ type: 'tool_result', content: 'quota_exceeded: tope' }] },
      });
    }
    terminar(`Registradas ${nuevas.length} empresas`);
  } else if (agente === 'Guardian') {
    const ids = /empresa_ids=([\d,]+)/.exec(mensaje)?.[1]?.split(',').map(Number) ?? [empresaId];
    for (const id of ids)
      await api('POST', '/etapa', {
        empresa_id: id,
        etapa: escenario.descartar?.includes(id) ? 'descartada' : 'filtrada',
        motivo: 'simulado',
      });
    terminar(`Filtradas ${ids.length}`);
  } else if (agente === 'Rastreador') {
    if (escenario.sin_datos?.includes(empresaId)) {
      await api('POST', '/etapa', {
        empresa_id: empresaId,
        etapa: 'descartada',
        motivo: 'sin_datos: simulado',
      });
      terminar('sin_datos');
    }
    await api('POST', '/contactos', {
      empresa_id: empresaId,
      tipo: 'correo',
      valor: `contacto${empresaId}@ejemplo.mx`,
      fuente_url: 'https://ejemplo.mx/contacto',
    });
    if (escenario.rastreador_olvida && !mensaje.includes('REINTENTO'))
      terminar('Terminé (sin cerrar la etapa)');
    await api('POST', '/etapa', { empresa_id: empresaId, etapa: 'enriquecida' });
    terminar('Contactos guardados');
  } else if (agente === 'Analista') {
    await api('POST', '/ficha', {
      empresa_id: empresaId,
      tamano: 'mediana',
      sucursales: 1,
      resumen: 'Empresa de manufactura con planta y oficina.',
      giro: 'Manufactura',
      sitio_verificado: true,
      necesidades: [{ texto: 'Estaciones de trabajo', tipo: 'inferencia' }],
    });
    await api('POST', '/etapa', { empresa_id: empresaId, etapa: 'analizada' });
    terminar('Ficha guardada');
  } else if (herramientas.includes('crm_guardar_propuestas')) {
    await api('POST', '/propuestas', {
      empresa_id: empresaId,
      productos: [
        { marca: 'Lenovo', categoria: 'ThinkStation', razon: 'Ingeniería', prioridad: 'alta' },
      ],
      paquetes: [
        {
          nombre: 'Estaciones y red',
          componentes: ['ThinkStation', 'Aruba AP'],
          argumento: 'Renueva estaciones y cobertura.',
        },
      ],
    });
    terminar('Paquetes guardados');
  } else if (agente === 'QA-1' || agente === 'QA-2') {
    const etapa = agente === 'QA-1' ? 'qa1' : 'qa2';
    const ex = await api('GET', `/expediente/${empresaId}`);
    const rechazos = ex.revisiones_qa.filter((r) => r.etapa === etapa && !r.aprobado).length;
    const quiere = escenario[`${etapa}_rechazos`] ?? 0;
    if (rechazos < quiere) {
      await api('POST', '/qa', {
        prospecto_id: prospectoId,
        etapa,
        aprobado: false,
        devolver_a: escenario[`${etapa}_destino`] ?? (etapa === 'qa1' ? 'Rastreador' : 'Redactor'),
        motivos: ['Dato dudoso simulado'],
      });
      terminar(`${agente} devolvió`);
    }
    await api('POST', '/qa', { prospecto_id: prospectoId, etapa, aprobado: true });
    if (etapa === 'qa2' && !escenario.no_finalizar)
      await api('POST', '/finalizar', { prospecto_id: prospectoId });
    terminar(`${agente} aprobó`);
  } else if (
    herramientas.includes('crm_guardar_score') ||
    herramientas.includes('crm_guardar_reporte')
  ) {
    if (herramientas.includes('crm_guardar_score'))
      await api('POST', '/score', {
        prospecto_id: prospectoId,
        score: 80,
        score_desglose: { ajuste: 25, necesidad: 20, contacto: 15, cercania: 10, capacidad: 10 },
        justificacion: 'Buen ajuste de giro.',
      });
    if (herramientas.includes('crm_guardar_reporte'))
      await api('POST', '/reporte', {
        prospecto_id: prospectoId,
        reporte_md: 'Oye jefe, encontré una empresa con buen potencial de equipos.',
        borrador_correo: 'Hola, ¿platicamos sobre sus equipos de cómputo?',
      });
    terminar('Guardado');
  } else terminar('Sin acción');
}
