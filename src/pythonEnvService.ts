import * as vscode from 'vscode';
import * as path from 'path';
import type { KernelSpecInfo } from './core/kernelRanking';
import { log } from './log';

/**
 * ms-python discovery seam.
 *
 * This is the ONLY module that touches the `ms-python.python` extension's
 * Environments API. It converts discovered Python environments into plain
 * `KernelSpecInfo` records so that no ms-python type leaks to callers — the
 * exported surface speaks only `unknown`, `KernelSpecInfo`, `vscode.*` and
 * primitives.
 *
 * The module is STATELESS by design: it caches nothing. Any caching of the
 * discovered list is the controller's responsibility.
 */

/**
 * Minimal, in-file view of the ms-python Environments API. NOT exported.
 * The real object comes from `ext.exports.environments`; we type it as
 * `unknown` at the boundary and narrow to this shape internally so we never
 * expose ms-python types. Every hop is optional because these shapes are
 * observed from the installed bundle, not a shipped `.d.ts`.
 */
interface EnvApiLike {
  readonly known?: readonly unknown[];
  refreshEnvironments?: () => Promise<void>;
  resolveEnvironment?: (env: unknown) => Promise<ResolvedEnvLike | undefined>;
}

/** Minimal view of a `ResolvedEnvironment`. NOT exported. */
interface ResolvedEnvLike {
  id?: string;
  executable?: { uri?: { fsPath?: string }; sysPrefix?: string };
  environment?: { type?: string; name?: string; folderUri?: { fsPath?: string } };
}

/**
 * Fetch the ms-python extension, activate it if needed, and return its
 * `environments` API namespace — or `undefined` if the extension is missing,
 * inactive-and-unactivatable, or does not expose the namespace.
 *
 * Return type is `unknown` deliberately: callers must not see ms-python types.
 */
export async function getEnvApi(): Promise<unknown | undefined> {
  try {
    const ext = vscode.extensions.getExtension('ms-python.python');
    if (!ext) {
      log('[pythonEnv] ms-python not installed');
      return undefined;
    }
    if (!ext.isActive) {
      await ext.activate();
    }
    const api = (ext.exports as { environments?: unknown } | undefined)?.environments;
    if (api) {
      log('[pythonEnv] got environments API from ms-python');
    } else {
      log('[pythonEnv] ms-python active but exports.environments is absent');
    }
    return api ?? undefined;
  } catch (err) {
    log(`[pythonEnv] getEnvApi failed: ${safeErr(err)}`);
    return undefined;
  }
}

/**
 * List discovered Python environments as plain `KernelSpecInfo`.
 *
 * Never throws to the caller: on any failure it returns `[]` or the partial
 * list gathered so far.
 *
 * IMPORTANT — `hasIpykernel` is ALWAYS `false` here. Unlike Jupyter kernel
 * specs, ms-python does NOT report whether `ipykernel`/`jupyter-server` are
 * installed in an environment, so discovery cannot know runnability. The real
 * dependency check is deferred to `envSetup.ensureRuntime` (Task 5), which
 * probes the interpreter directly before launch. We intentionally do NOT probe
 * ipykernel in this module (no `child_process` here — that is a different
 * module's job). The pure ranker `rankKernelSpecs` still works; it just ranks
 * every env as not-yet-verified within its tier.
 */
export async function listEnvironments(): Promise<KernelSpecInfo[]> {
  const api = (await getEnvApi()) as EnvApiLike | undefined;
  if (!api) return [];

  const results: KernelSpecInfo[] = [];

  try {
    let known: readonly unknown[] = Array.isArray(api.known) ? api.known : [];

    // Force a single rescan if nothing has been discovered yet. Guard against
    // an absent refresh method and only refresh when empty so we neither
    // infinite-loop nor rescan on every call.
    if (known.length === 0 && typeof api.refreshEnvironments === 'function') {
      log('[pythonEnv] known is empty; refreshing environments once');
      await api.refreshEnvironments();
      known = Array.isArray(api.known) ? api.known : [];
    }

    log(`[pythonEnv] ${known.length} known environment(s) to resolve`);

    for (const env of known) {
      try {
        if (typeof api.resolveEnvironment !== 'function') break;
        const resolved = await api.resolveEnvironment(env);
        if (!resolved) {
          log('[pythonEnv] resolveEnvironment returned undefined; skipping');
          continue;
        }

        const interpreterPath = resolved.executable?.uri?.fsPath;
        if (!interpreterPath) {
          // No executable path → can't launch a server from it. Skip.
          log(`[pythonEnv] skip env ${resolved.id ?? '<no id>'}: no executable path`);
          continue;
        }

        const id = resolved.id ?? interpreterPath;
        const displayName =
          resolved.environment?.name ?? basenameFallback(interpreterPath) ?? resolved.id ?? id;

        results.push({
          id,
          displayName,
          language: 'python',
          interpreterPath,
          hasIpykernel: false, // see module doc — runnability is checked later.
        });
      } catch (err) {
        // One bad env must not sink the list. Log a safe scalar summary.
        log(`[pythonEnv] resolveEnvironment threw; skipping one env: ${safeErr(err)}`);
        continue;
      }
    }
  } catch (err) {
    log(`[pythonEnv] listEnvironments failed mid-scan: ${safeErr(err)}`);
    // fall through and return whatever we gathered.
  }

  log(`[pythonEnv] listEnvironments returning ${results.length} environment(s)`);
  return results;
}

/**
 * Derive a human-readable name from the interpreter path: prefer the parent
 * directory's name (often the env name, e.g. `.venv` or a conda env folder),
 * else the interpreter file name. Returns undefined only for empty input.
 */
function basenameFallback(interpreterPath: string): string | undefined {
  const parentDir = path.basename(path.dirname(interpreterPath));
  if (parentDir && parentDir !== '.' && parentDir !== path.sep) return parentDir;
  const file = path.basename(interpreterPath);
  return file || undefined;
}

/** Compact, non-circular error summary safe to log (never dumps vscode.Uri). */
function safeErr(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === 'string') return err;
  return typeof err;
}
