// Cliente HTTP del MCP hacia el CRM local (así el servidor emite los eventos en vivo).

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class CrmApi {
  constructor(
    private readonly base: string,
    private readonly token: string,
    private readonly agente: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const res = await this.fetchFn(`${this.base}/api/agent${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': this.token,
        'x-agent-name': this.agente,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const texto = await res.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      /* respuesta no JSON */
    }
    if (!res.ok) {
      const msg = (json as { error?: string } | null)?.error ?? texto.slice(0, 200);
      throw new ApiError(res.status, msg || `HTTP ${res.status}`);
    }
    return json;
  }

  get = (path: string) => this.call('GET', path);
  post = (path: string, body: unknown) => this.call('POST', path, body);
}
