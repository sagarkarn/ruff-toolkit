import { execFile, ExecFileOptions, spawn } from 'child_process';
import { CancellationToken } from 'vscode';
import { ProcessResult } from '../types';

/**
 * Executes a process using execFile and returns a timed result.
 * Supports cwd and environment options.
 */
export function executeProcess(
  file: string,
  args: string[],
  options: ExecFileOptions = {}
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    execFile(file, args, options, (error, stdout, stderr) => {
      const duration = Date.now() - startTime;
      const stdoutStr = typeof stdout === 'string' ? stdout : stdout.toString('utf8');
      const stderrStr = typeof stderr === 'string' ? stderr : stderr.toString('utf8');

      if (error) {
        resolve({
          code: error.code ?? null,
          stdout: stdoutStr,
          stderr: stderrStr || error.message,
          duration,
          error
        });
      } else {
        resolve({
          code: 0,
          stdout: stdoutStr,
          stderr: stderrStr,
          duration
        });
      }
    });
  });
}
export function executeProcessCancelable(
  file: string,
  args: string[],
  options: ExecFileOptions = {},
  token: CancellationToken
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn(file, args, { ...options, shell: false });
    let stdout = '';
    let stderr = '';

    const onData = (data: Buffer) => {
      stdout += data.toString('utf8');
    };
    const onErrorData = (data: Buffer) => {
      stderr += data.toString('utf8');
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onErrorData);

    const cancellationDisposable = token.onCancellationRequested(() => {
      // Kill the process if cancellation requested
      try {
        child.kill();
      } catch (e) {
        // Ignored
      }
    });

    const cleanup = () => {
      child.stdout?.off('data', onData);
      child.stderr?.off('data', onErrorData);
      cancellationDisposable.dispose();
    };

    child.on('close', (code: number | null) => {
      cleanup();
      const duration = Date.now() - startTime;
      resolve({
        code,
        stdout,
        stderr,
        duration,
        error: code && code !== 0 ? new Error(`Process exited with code ${code}`) : undefined
      });
    });
  });
}
