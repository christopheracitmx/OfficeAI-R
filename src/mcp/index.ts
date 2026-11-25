import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CrmApi } from './api';
import { crmTools } from './tools-crm';
import { extractSchema, obscuraExtract, placesDescubrir, placesSchema, type WebDeps } from './tools-web';

// El proceso MCP lo lanza Munder: las rutas se resuelven respecto a este archivo, no al cwd.
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
if (existsSync(resolve(raiz, '.env'))) process.loadEnvFile(resolve(raiz, '.env'));

const base = process.env['CRM_URL'] ?? `http://127.0.0.1:${process.env['CRM_PORT'] ?? 4010}`;
const tokenFile = resolve(raiz, process.env['CRM_AGENT_TOKEN_FILE'] ?? 'data/agent.token');
const agente = process.env['CRM_AGENT'] ?? 'Coordinador';
const token = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '';

const api = new CrmApi(base, token, agente);
const web: WebDeps = {
  api,
  obscura: { bin: resolve(raiz, process.env['OBSCURA_BIN'] ?? '../tools/obscura/obscura.exe') },
  placesKey: process.env['GOOGLE_PLACES_API_KEY'] ?? '',
};

const salida = (data: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data) }],
  ...(isError ? { isError: true } : {}),
});

const server = new McpServer({ name: 'acitmx-crm', version: '0.1.0' });

for (const t of crmTools(api)) {
  server.registerTool(t.name, { description: t.description, inputSchema: t.schema }, async (args) => {
    try {
      return salida(await t.run(args as Record<string, unknown>));
    } catch (e) {
      return salida(e instanceof Error ? e.message : String(e), true);
    }
  });
}

server.registerTool(
  'obscura_extract',
  {
    description:
      'Lee una página pública con Obscura (local, rápido) y devuelve texto compacto + correos y teléfonos ya extraídos por código. Usa caché. Si devuelve ok:false usa web_search.',
    inputSchema: extractSchema,
  },
  async ({ url }) => salida(await obscuraExtract(url, web)),
);

server.registerTool(
  'places_search',
  {
    description:
      'Descubre empresas con Google Places (cuota limitada, tope duro) y las registra directo en el directorio. Devuelve solo un resumen. No pidas más empresas de las que permite la corrida.',
    inputSchema: placesSchema,
  },
  async ({ consulta, max }) => {
    try {
      return salida(await placesDescubrir(consulta, max, web));
    } catch (e) {
      return salida(e instanceof Error ? e.message : String(e), true);
    }
  },
);

await server.connect(new StdioServerTransport());
console.error(`[acitmx-crm MCP] agente=${agente} api=${base}`);
