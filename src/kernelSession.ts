import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import { ServerConnection, KernelManager, KernelMessage, type Kernel } from '@jupyterlab/services';
import { log } from './log';

// ---------------------------------------------------------------------------
// Public seam (the ONLY exports). No @jupyterlab/services type may appear in
// these signatures — they're the backend-agnostic contract the controller
// consumes. A future ZMQ transport implements the same interface.
// ---------------------------------------------------------------------------

/** One execution's streamed output, shaped to match the controller's per-cell loop. */
export interface KernelOutput {
  items: { mime: string; data: Uint8Array }[];
}

/** A live kernel the controller runs cells against and disposes. */
export interface KernelSession {
  executeCode(code: string, token: vscode.CancellationToken): AsyncIterable<KernelOutput>;
  /** Interrupt the running execution (SIGINT to the kernel). Best-effort. */
  interrupt(): Promise<void>;
  /**
   * Restart the kernel, clearing its state. Reuses the same server connection.
   * Resolves `true` on success, `false` on failure. Plain boolean by design —
   * no backend type leaks through the seam.
   */
  restart(): Promise<boolean>;
  /**
   * True once the underlying kernel has died or lost its connection. The
   * controller evicts a stale session so the next run starts fresh. Plain
   * boolean by design — no backend type leaks through the seam.
   */
  readonly isStale: boolean;
  /** Shut down kernel + server. Best-effort, idempotent. */
  dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Encoding helpers (small, deliberately — not a renderer negotiation).
// ---------------------------------------------------------------------------

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

const BASE64_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif']);

/**
 * Turn a single Jupyter MIME-bundle value into bytes for NotebookCellOutputItem.
 * - base64 image string  -> decode base64 to raw bytes
 * - any other string     -> UTF-8 bytes
 * - object (json/plotly) -> UTF-8 of JSON.stringify
 */
function encodeMimeValue(mime: string, value: unknown): Uint8Array {
  if (BASE64_IMAGE_MIMES.has(mime) && typeof value === 'string') {
    return Buffer.from(value, 'base64');
  }
  if (typeof value === 'string') {
    return enc(value);
  }
  return enc(JSON.stringify(value));
}

/** Map a single IOPub message to a KernelOutput, or undefined to ignore it. */
function mapIOPub(msg: KernelMessage.IIOPubMessage): KernelOutput | undefined {
  if (KernelMessage.isStreamMsg(msg)) {
    const mime =
      msg.content.name === 'stderr'
        ? 'application/vnd.code.notebook.stderr'
        : 'application/vnd.code.notebook.stdout';
    return { items: [{ mime, data: enc(msg.content.text) }] };
  }

  if (KernelMessage.isExecuteResultMsg(msg) || KernelMessage.isDisplayDataMsg(msg)) {
    const bundle = msg.content.data as { [mime: string]: unknown };
    const items = Object.keys(bundle).map((mime) => ({
      mime,
      data: encodeMimeValue(mime, bundle[mime]),
    }));
    return { items };
  }

  if (KernelMessage.isErrorMsg(msg)) {
    const { ename, evalue, traceback } = msg.content;
    const data = enc(
      JSON.stringify({
        name: ename,
        message: evalue,
        stack: (traceback || []).join('\n'),
      }),
    );
    return { items: [{ mime: 'application/vnd.code.notebook.error', data }] };
  }

  // status, execute_input, comm_*, etc. -> ignore.
  // Deliberately NOT handled in this first cut: update_display_data and
  // clear_output. Consequence: in-place progress-bar/animation updates are
  // silently dropped (only the initial display_data renders). Acceptable for
  // Option A; revisit if live-updating widgets become a requirement.
  return undefined;
}

// ---------------------------------------------------------------------------
// Step 2 — spawn the Jupyter server and parse its URL/port.
// ---------------------------------------------------------------------------

interface ServerHandle {
  child: ChildProcess;
  baseUrl: string;
  token: string;
}

const SERVER_START_TIMEOUT_MS = 30_000;
// Matches the running-URL banner Jupyter prints to stdout/stderr, e.g.
// "http://127.0.0.1:8888/lab?token=..." — we only need the port.
const URL_RE = /https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)\//;

async function spawnServer(interpreterPath: string): Promise<ServerHandle | undefined> {
  const token = randomBytes(24).toString('hex');
  const args = [
    '-m',
    'jupyter',
    'server',
    '--no-browser',
    '--ServerApp.port=0',
    `--ServerApp.token=${token}`,
    '--ServerApp.disable_check_xsrf=True',
  ];

  let child: ChildProcess;
  try {
    child = spawn(interpreterPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    log(`[kernelSession] failed to spawn server: ${String(err)}`);
    return undefined;
  }

  return await new Promise<ServerHandle | undefined>((resolve) => {
    let settled = false;
    // Rolling per-stream accumulation. The banner URL can straddle a
    // pipe-buffer boundary, so we must match against the ACCUMULATED text,
    // not the individual chunk. errBuf also feeds the diagnostic logs below.
    let outBuf = '';
    let errBuf = '';

    const finish = (result: ServerHandle | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.removeAllListeners('data');
      child.stderr?.removeAllListeners('data');
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      resolve(result);
    };

    const scan = (chunk: Buffer, isErr: boolean) => {
      const text = chunk.toString('utf8');
      const buf = isErr ? (errBuf += text) : (outBuf += text);
      const m = URL_RE.exec(buf);
      if (m) {
        const port = m[1];
        const baseUrl = `http://127.0.0.1:${port}`;
        log(`[kernelSession] server pid=${child.pid} port=${port}`);
        finish({ child, baseUrl, token });
      }
    };

    const onError = (err: Error) => {
      log(`[kernelSession] server process error: ${String(err)}`);
      try {
        child.kill();
      } catch {
        /* best-effort */
      }
      finish(undefined);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      log(
        `[kernelSession] server exited before ready (code=${code} signal=${signal}); stderr:\n${errBuf}`,
      );
      finish(undefined);
    };

    const timer = setTimeout(() => {
      log(
        `[kernelSession] server start timed out after ${SERVER_START_TIMEOUT_MS}ms; killing. stderr:\n${errBuf}`,
      );
      try {
        child.kill();
      } catch {
        /* best-effort */
      }
      finish(undefined);
    }, SERVER_START_TIMEOUT_MS);

    child.stdout?.on('data', (c: Buffer) => scan(c, false));
    child.stderr?.on('data', (c: Buffer) => scan(c, true));
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

// ---------------------------------------------------------------------------
// ServerKernelSession — the jupyter-server/WS implementation of KernelSession.
// ---------------------------------------------------------------------------

class ServerKernelSession implements KernelSession {
  private disposed = false;
  private stale = false;

  constructor(
    private readonly child: ChildProcess,
    private readonly kernelManager: KernelManager,
    private readonly kernel: Kernel.IKernelConnection,
  ) {
    // Death detection: a kernel can die out-of-band (OOM, os._exit(0), server
    // crash). When it does, mark the session stale so the controller evicts it
    // and re-resolves a fresh kernel on the next run — no window reload.
    this.kernel.statusChanged.connect((_sender, status) => {
      if (status === 'dead') {
        log(`[kernelSession] kernel status=dead (id=${this.kernel.id}) -> stale`);
        this.stale = true;
      }
    });
    this.kernel.connectionStatusChanged.connect((_sender, status) => {
      if (status === 'disconnected') {
        log(`[kernelSession] kernel connection disconnected (id=${this.kernel.id}) -> stale`);
        this.stale = true;
      }
    });
  }

  get isStale(): boolean {
    return this.stale;
  }

  /**
   * Bridge the callback-style `future.onIOPub` + `future.done` into an
   * AsyncIterable. Mechanism: a FIFO `queue` of mapped outputs plus a single
   * parked `waiter` resolver. `onIOPub` pushes into the queue (waking a parked
   * consumer); `future.done` (resolve OR reject) flips `finished` and wakes the
   * consumer. The generator yields queued items first, then — only when the
   * queue is empty — awaits the waiter. This guarantees no message is lost
   * between the final yield and completion, and the consumer never hangs
   * because completion always resolves the parked waiter.
   */
  executeCode(code: string, token: vscode.CancellationToken): AsyncIterable<KernelOutput> {
    const kernel = this.kernel;
    log(`[kernelSession] execute begin (${code.length} chars)`);

    const future = kernel.requestExecute({ code, stop_on_error: true });

    const queue: KernelOutput[] = [];
    let finished = false;
    let waiter: (() => void) | undefined;

    const wake = () => {
      if (waiter) {
        const w = waiter;
        waiter = undefined;
        w();
      }
    };

    future.onIOPub = (msg) => {
      try {
        const out = mapIOPub(msg as KernelMessage.IIOPubMessage);
        if (out) {
          queue.push(out);
          wake();
        }
      } catch (err) {
        log(`[kernelSession] onIOPub mapping error: ${String(err)}`);
      }
    };

    const complete = () => {
      finished = true;
      wake();
    };
    future.done.then(
      () => {
        log('[kernelSession] execute done');
        complete();
      },
      (err) => {
        log(`[kernelSession] execute future rejected: ${String(err)}`);
        complete();
      },
    );

    const cancelSub = token.onCancellationRequested(() => {
      log('[kernelSession] cancellation requested -> interrupt');
      kernel.interrupt().catch((err) => {
        log(`[kernelSession] interrupt failed: ${String(err)}`);
      });
    });

    async function* generator(): AsyncIterable<KernelOutput> {
      try {
        while (true) {
          // Drain everything already queued before considering completion.
          if (queue.length > 0) {
            yield queue.shift()!;
            continue;
          }
          if (finished) {
            return;
          }
          // Queue empty and not finished: park until woken by a push or by
          // completion. The `finished`/queue re-check on the next loop makes
          // this hang-safe.
          await new Promise<void>((resolve) => {
            waiter = resolve;
          });
        }
      } finally {
        cancelSub.dispose();
      }
    }

    return generator();
  }

  async interrupt(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.kernel.interrupt();
      log('[kernelSession] interrupt ok');
    } catch (err) {
      log(`[kernelSession] interrupt error: ${String(err)}`);
    }
  }

  async restart(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      // jupyterlab restart() reuses the same server + kernel connection, so the
      // session stays valid; it just clears kernel state (variables, imports).
      await this.kernel.restart();
      this.stale = false;
      log(`[kernelSession] kernel restarted (id=${this.kernel.id})`);
      return true;
    } catch (err) {
      log(`[kernelSession] restart error: ${String(err)}`);
      return false;
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    try {
      await this.kernel.shutdown();
      log('[kernelSession] kernel shutdown ok');
    } catch (err) {
      log(`[kernelSession] kernel shutdown error: ${String(err)}`);
    }

    try {
      this.kernelManager.dispose();
      log('[kernelSession] kernelManager disposed');
    } catch (err) {
      log(`[kernelSession] kernelManager dispose error: ${String(err)}`);
    }

    try {
      this.child.kill();
      log(`[kernelSession] server child killed (pid=${this.child.pid})`);
    } catch (err) {
      log(`[kernelSession] server kill error: ${String(err)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Step 1 entry point — launch server, connect, start kernel, return session.
// ---------------------------------------------------------------------------

/**
 * Launch a Jupyter server in `interpreterPath`'s env, start a python3 kernel,
 * and return a KernelSession. Returns undefined (never throws) on any failure,
 * cleaning up the server child so no orphan process is leaked.
 */
export async function startServerKernel(interpreterPath: string): Promise<KernelSession | undefined> {
  const server = await spawnServer(interpreterPath);
  if (!server) {
    return undefined;
  }

  const { child, baseUrl, token } = server;

  // Declared out here so the catch can dispose it: KernelManager owns a Poll
  // (timer + listeners) that would otherwise keep firing against a dead server.
  let kernelManager: KernelManager | undefined;
  try {
    const settings = ServerConnection.makeSettings({
      baseUrl,
      wsUrl: baseUrl.replace(/^http/, 'ws'),
      token,
    });
    kernelManager = new KernelManager({ serverSettings: settings });
    const kernel = await kernelManager.startNew({ name: 'python3' });
    log(`[kernelSession] kernel started id=${kernel.id} name=${kernel.name}`);
    return new ServerKernelSession(child, kernelManager, kernel);
  } catch (err) {
    log(`[kernelSession] connect/startKernel failed: ${String(err)}`);
    try {
      kernelManager?.dispose();
    } catch {
      /* best-effort */
    }
    try {
      child.kill();
    } catch {
      /* best-effort */
    }
    return undefined;
  }
}
