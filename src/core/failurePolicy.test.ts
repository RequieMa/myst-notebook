import { describe, it, expect } from 'vitest';
import {
  classifyRuntime,
  buildInstallCommands,
  installOutcome,
  deriveCellSuccess,
  messageFor,
  FAILURE_KINDS,
} from './failurePolicy';

describe('classifyRuntime', () => {
  it('returns empty when both present', () => {
    expect(classifyRuntime({ ipykernel: true, jupyterServer: true })).toEqual([]);
  });
  it('maps missing ipykernel to pip name', () => {
    expect(classifyRuntime({ ipykernel: false, jupyterServer: true })).toEqual(['ipykernel']);
  });
  it('maps missing jupyter_server to pip name jupyter-server', () => {
    expect(classifyRuntime({ ipykernel: true, jupyterServer: false })).toEqual(['jupyter-server']);
  });
  it('returns both pip names when both missing, ipykernel first', () => {
    expect(classifyRuntime({ ipykernel: false, jupyterServer: false })).toEqual([
      'ipykernel',
      'jupyter-server',
    ]);
  });
});

describe('buildInstallCommands', () => {
  it('conda env path → [conda, pip, uv] in that order', () => {
    const cmds = buildInstallCommands('/opt/conda/envs/myenv/bin/python', ['ipykernel']);
    expect(cmds).toHaveLength(3);
    expect(cmds[0]).toEqual({
      command: 'conda',
      args: ['install', '-n', 'myenv', '-y', 'ipykernel'],
    });
    expect(cmds[1]).toEqual({
      command: '/opt/conda/envs/myenv/bin/python',
      args: ['-m', 'pip', 'install', 'ipykernel'],
    });
    expect(cmds[2]).toEqual({
      command: 'uv',
      args: ['pip', 'install', '--python', '/opt/conda/envs/myenv/bin/python', 'ipykernel'],
    });
  });

  it('non-conda path → [pip, uv] (no conda entry)', () => {
    const cmds = buildInstallCommands('/usr/bin/python3', ['ipykernel', 'jupyter-server']);
    expect(cmds).toHaveLength(2);
    expect(cmds[0]).toEqual({
      command: '/usr/bin/python3',
      args: ['-m', 'pip', 'install', 'ipykernel', 'jupyter-server'],
    });
    expect(cmds[1]).toEqual({
      command: 'uv',
      args: ['pip', 'install', '--python', '/usr/bin/python3', 'ipykernel', 'jupyter-server'],
    });
  });

  it('conda env path with /envs/ but unparseable name → [pip, uv]', () => {
    // /envs/ is present but no trailing segment → conda env name can't be extracted.
    const cmds = buildInstallCommands('/weird/envs/', ['ipykernel']);
    expect(cmds).toHaveLength(2);
    expect(cmds[0].command).toBe('/weird/envs/'); // pip
  });

  it('pyenv path → [pip, uv] (not mistaken for conda or uv)', () => {
    const cmds = buildInstallCommands('/home/user/.pyenv/versions/3.12.0/bin/python', ['ipykernel']);
    expect(cmds).toHaveLength(2);
    expect(cmds[0]).toEqual({
      command: '/home/user/.pyenv/versions/3.12.0/bin/python',
      args: ['-m', 'pip', 'install', 'ipykernel'],
    });
  });

  it('standard venv path → [pip, uv] (not mistaken for uv-managed)', () => {
    const cmds = buildInstallCommands('/home/user/project/.venv/bin/python', ['ipykernel']);
    expect(cmds).toHaveLength(2);
    expect(cmds[0]).toEqual({
      command: '/home/user/project/.venv/bin/python',
      args: ['-m', 'pip', 'install', 'ipykernel'],
    });
  });

  it('Windows conda env path → [conda, pip, uv]', () => {
    const cmds = buildInstallCommands(
      'C:\\Users\\user\\miniconda3\\envs\\myenv\\python.exe',
      ['ipykernel']
    );
    expect(cmds).toHaveLength(3);
    expect(cmds[0]).toEqual({
      command: 'conda',
      args: ['install', '-n', 'myenv', '-y', 'ipykernel'],
    });
  });

  it('multiple packages are passed through to all commands', () => {
    const cmds = buildInstallCommands('/usr/bin/python3', ['ipykernel', 'jupyter-server']);
    for (const cmd of cmds) {
      expect(cmd.args).toContain('ipykernel');
      expect(cmd.args).toContain('jupyter-server');
    }
  });
});

describe('installOutcome', () => {
  it('ok when exit 0 and both present after', () => {
    expect(
      installOutcome(0, { ipykernel: true, jupyterServer: true })
    ).toEqual({ ok: true, kind: 'ok' });
  });
  it('nonZeroExit when exit code is non-zero', () => {
    expect(installOutcome(1, { ipykernel: false, jupyterServer: false })).toEqual({
      ok: false,
      kind: 'nonZeroExit',
    });
  });
  it('nonZeroExit when exit code is undefined (task never launched)', () => {
    expect(installOutcome(undefined, { ipykernel: true, jupyterServer: true })).toEqual({
      ok: false,
      kind: 'nonZeroExit',
    });
  });
  it('exitZeroStillMissing when exit 0 but a package is still absent', () => {
    expect(installOutcome(0, { ipykernel: true, jupyterServer: false })).toEqual({
      ok: false,
      kind: 'exitZeroStillMissing',
    });
  });
});

describe('deriveCellSuccess', () => {
  it('true when no error and session live', () => {
    expect(deriveCellSuccess({ sawError: false, isStale: false })).toBe(true);
  });
  it('false when an error output streamed', () => {
    expect(deriveCellSuccess({ sawError: true, isStale: false })).toBe(false);
  });
  it('false when session went stale mid-run (kernel died)', () => {
    expect(deriveCellSuccess({ sawError: false, isStale: true })).toBe(false);
  });
  it('false when both error and stale', () => {
    expect(deriveCellSuccess({ sawError: true, isStale: true })).toBe(false);
  });
});

describe('messageFor', () => {
  it('every FailureKind maps to a non-empty string mentioning MyST', () => {
    for (const kind of FAILURE_KINDS) {
      const msg = messageFor(kind);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).toMatch(/MyST/);
    }
  });
  it('noPython message tells the user to install the Python extension', () => {
    expect(messageFor('noPython')).toMatch(/Python extension/);
  });
  it('installDeclined message tells the user they can retry', () => {
    expect(messageFor('installDeclined')).toMatch(/retry/i);
  });
  it('serverStartFailed message points to the output channel', () => {
    expect(messageFor('serverStartFailed')).toMatch(/output/i);
  });
  it('every message starts with the MyST Notebook prefix', () => {
    for (const kind of FAILURE_KINDS) {
      expect(messageFor(kind)).toMatch(/^MyST Notebook:/);
    }
  });
});
