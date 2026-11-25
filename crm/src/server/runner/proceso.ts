import { spawn, type ChildProcess } from 'node:child_process';

export interface OpcionesProceso {
  bin: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string | undefined;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
  /** Se llama por cada línea completa de stdout. */
  onLinea?: ((linea: string) => void) | undefined;
}

export interface ResultadoProceso {
  codigo: number | null;
  stdout: string;
  stderr: string;
  timeout: boolean;
  abortado: boolean;
  /** No se pudo lanzar el ejecutable (ENOENT, etc.). */
  errorLanzamiento?: string;
}

const MAX_RETENIDO = 2_000_000;
const retener = (acum: string, trozo: string): string =>
  (acum + trozo).length > MAX_RETENIDO ? (acum + trozo).slice(-MAX_RETENIDO) : acum + trozo;

/** Mata el proceso y TODOS sus hijos (el CLI lanza procesos MCP propios). */
export function matarArbol(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    const k = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    k.on('error', () => child.kill());
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

/** Ejecuta un proceso hijo con timeout y cancelación. Nunca lanza: informa en el resultado. */
export function ejecutarProceso(o: OpcionesProceso): Promise<ResultadoProceso> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let resto = '';
    let timeout = false;
    let abortado = false;
    let terminado = false;

    let child: ChildProcess;
    try {
      child = spawn(o.bin, o.args, {
        cwd: o.cwd,
        env: o.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
    } catch (e) {
      resolve({
        codigo: null,
        stdout,
        stderr,
        timeout,
        abortado,
        errorLanzamiento: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    const cerrar = (r: Partial<ResultadoProceso>) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      o.signal?.removeEventListener('abort', alAbortar);
      if (resto && o.onLinea) o.onLinea(resto);
      resolve({ codigo: null, stdout, stderr, timeout, abortado, ...r });
    };

    const timer = setTimeout(() => {
      timeout = true;
      matarArbol(child);
    }, o.timeoutMs);
    const alAbortar = () => {
      abortado = true;
      matarArbol(child);
    };
    if (o.signal?.aborted) alAbortar();
    else o.signal?.addEventListener('abort', alAbortar, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (t: string) => {
      stdout = retener(stdout, t);
      if (!o.onLinea) return;
      resto += t;
      const lineas = resto.split('\n');
      resto = lineas.pop() ?? '';
      for (const l of lineas) if (l.trim()) o.onLinea(l);
    });
    child.stderr?.on('data', (t: string) => {
      stderr = retener(stderr, t);
    });
    child.stdin?.on('error', () => undefined);
    child.on('error', (e) => cerrar({ errorLanzamiento: e.message }));
    child.on('close', (codigo) => cerrar({ codigo }));

    if (o.stdin !== undefined) child.stdin?.end(o.stdin);
    else child.stdin?.end();
  });
}
