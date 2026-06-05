import { execFile, ExecFileOptions } from 'child_process';
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
