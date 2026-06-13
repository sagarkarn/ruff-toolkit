import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { executeProcess, executeProcessCancelable } from '../utils/process';
import { getWorkspacePath } from '../utils/fileUtils';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}
import { outputService } from './outputService';
import { ExtensionSettings, ProcessResult, RuffCommandResult } from '../types';

export class RuffService {
  private static instance: RuffService | null = null;

  private diagnosticCollection: vscode.DiagnosticCollection;
  public isLspActive = false;

  private constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('ruff');
  }

  public static getInstance(): RuffService {
    if (!RuffService.instance) {
      RuffService.instance = new RuffService();
    }
    return RuffService.instance;
  }

  /**
   * Dispose all diagnostics when the extension is deactivated.
   */
  public disposeDiagnostics(): void {
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
  }

  /**
   * Publish diagnostics for a file based on Ruff output.
   */
  private publishDiagnostics(uri: vscode.Uri, result: RuffCommandResult): void {
    const diagnostics: vscode.Diagnostic[] = [];
    const lines = (result.stdout + '\n' + result.stderr).split(/\r?\n/);
    const regex = /^(.*?):(\d+):(\d+):\s*(\w+)\s+(.*)$/; // path:line:col: CODE message
    for (const line of lines) {
      const match = regex.exec(line);
      if (match) {
        const [, , lineStr, colStr, code, message] = match;
        const lineNum = Number(lineStr) - 1; // VSCode is 0‑based
        const colNum = Number(colStr) - 1;
        const range = new vscode.Range(lineNum, colNum, lineNum, colNum + 1);
        const severity = code.startsWith('E') ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
        const diagnostic = new vscode.Diagnostic(range, `${code} ${message}`, severity);
        diagnostics.push(diagnostic);
      }
    }
    this.diagnosticCollection.set(uri, diagnostics);
  }

  /**
   * Retrieves the current extension settings.
   */
  public getSettings(): ExtensionSettings {
    const config = vscode.workspace.getConfiguration('ruffToolkit');
    return {
      ruffPath: config.get<string>('ruffPath', 'ruff'),
      showNotifications: config.get<boolean>('showNotifications', true),
      autoRefresh: config.get<boolean>('autoRefresh', true),
    };
  }

  /**
   * Resolve the path to the Ruff executable.
   * Checks Python extension, local workspace virtual environments, and settings.
   */
  public async resolveRuffPath(uri?: vscode.Uri): Promise<string> {
    // 1. Try Microsoft Python extension API
    try {
      const pythonExtension = vscode.extensions.getExtension('ms-python.python');
      if (pythonExtension) {
        if (!pythonExtension.isActive) {
          await pythonExtension.activate();
        }
        const api = pythonExtension.exports;
        if (api && api.environments) {
          const activeEnvPath = api.environments.getActiveEnvironmentPath(uri);
          if (activeEnvPath && activeEnvPath.path) {
            const resolvedEnv = await api.environments.resolveEnvironment(activeEnvPath);
            const pythonPath = resolvedEnv?.executable?.uri?.fsPath || activeEnvPath.path;
            if (pythonPath) {
              const pythonDir = path.dirname(pythonPath);
              const ruffWindows = path.join(pythonDir, 'ruff.exe');
              const ruffUnix = path.join(pythonDir, 'ruff');
              if (await fileExists(ruffWindows)) {
                return ruffWindows;
              }
              if (await fileExists(ruffUnix)) {
                return ruffUnix;
              }
            }
          }
        }
      }
    } catch (e) {
      outputService.logError(`Error querying Python extension API: ${e}`);
    }

    // 2. Try detecting python virtual environments relative to workspace folder
    const workspacePath = getWorkspacePath(uri);
    if (workspacePath) {
      const venvDirs = ['.venv', 'venv', 'env', '.conda'];
      for (const venvDir of venvDirs) {
        const venvRoot = path.join(workspacePath, venvDir);
        const possiblePaths = [
          path.join(venvRoot, 'Scripts', 'ruff.exe'),
          path.join(venvRoot, 'Scripts', 'ruff'),
          path.join(venvRoot, 'bin', 'ruff'),
          path.join(venvRoot, 'bin', 'ruff.exe'),
        ];
        for (const p of possiblePaths) {
          if (await fileExists(p)) {
            return p;
          }
        }
      }
    }

    // 3. Fall back to settings
    const settings = this.getSettings();
    if (settings.ruffPath && settings.ruffPath !== 'ruff') {
      return settings.ruffPath;
    }

    // 4. Fall back to global "ruff"
    return 'ruff';
  }

  /**
   * Checks if Ruff is installed by running `<ruffPath> --version`.
   * Displays an error notification if not found.
   */
  public async checkRuffInstalled(uri?: vscode.Uri): Promise<boolean> {
    const ruffPath = await this.resolveRuffPath(uri);
    const result = await executeProcess(ruffPath, ['--version']);
    
    if (result.error || result.code !== 0) {
      const errorMsg = 
        `Ruff executable not found.\n` +
        `Please install Ruff:\n\n` +
        `pip install ruff`;
      
      vscode.window.showErrorMessage(errorMsg, { modal: true });
      outputService.logError(`Ruff validation failed. Executable: "${ruffPath}". Stderr: ${result.stderr}`);
      return false;
    }
    
    return true;
  }

  /**
   * Runs a command and logs/displays notifications.
   */
  async runRuffCommand(
    args: string[],
    cwd: string | undefined,
    actionLabel: string,
    successMessage: string,
    uriToRefresh?: vscode.Uri,
    silent = false,
    token?: vscode.CancellationToken
  ): Promise<RuffCommandResult> {
    const ruffPath = await this.resolveRuffPath(uriToRefresh);
    const settings = this.getSettings();
    const commandStr = `${ruffPath} ${args.join(' ')}`;
    
    let result: ProcessResult;
    if (token) {
      result = await executeProcessCancelable(ruffPath, args, { cwd }, token);
    } else {
      result = await executeProcess(ruffPath, args, { cwd });
    }
    
    // Ruff check command exits with 1 if it finds violations. This is not a CLI failure.
    // Exit code 0 is clean. Exit code 1 means issues found/fixed.
    // Other codes are CLI execution errors.
    const isSuccess = result.code === 0 || result.code === 1;

    let violationsCount: number | undefined;
    if (isSuccess && actionLabel.startsWith('check')) {
      if (result.code === 1) {
        const match = result.stdout.match(/Found (\d+) errors?\b/) || result.stderr.match(/Found (\d+) errors?\b/);
        violationsCount = match ? parseInt(match[1], 10) : undefined;
      } else if (result.code === 0) {
        violationsCount = 0;
      }
    }

    const commandResult: RuffCommandResult = {
      success: isSuccess,
      message: isSuccess ? successMessage : `Ruff command failed with code ${result.code}`,
      duration: result.duration,
      stdout: result.stdout,
      stderr: result.stderr,
      command: commandStr,
      violationsCount,
    };

    outputService.logCommandResult(commandResult);

    // Publish diagnostics for check actions
    if (actionLabel.startsWith('check') && uriToRefresh) {
      if (this.isLspActive) {
        this.diagnosticCollection.delete(uriToRefresh);
      } else {
        this.publishDiagnostics(uriToRefresh, commandResult);
      }
    }

    if (isSuccess) {
      if (settings.showNotifications && !silent) {
        if (actionLabel.startsWith('check')) {
          if (violationsCount === 0) {
            vscode.window.showInformationMessage(`✓ Ruff check completed: no issues found`);
          } else {
            const countStr = violationsCount !== undefined ? `${violationsCount} issues` : 'issues';
            vscode.window.showWarningMessage(
              `⚠ Ruff check completed: found ${countStr}.`,
              'Show Output'
            ).then(selection => {
              if (selection === 'Show Output') {
                outputService.show();
              }
            });
          }
        } else {
          vscode.window.showInformationMessage(`✓ Ruff ${actionLabel} completed`);
        }
      }
      
      if (settings.autoRefresh && uriToRefresh && uriToRefresh.scheme === 'file') {
        try {
          await vscode.workspace.fs.stat(uriToRefresh);
        } catch (e) {
          outputService.logError(`Failed to refresh file state for ${uriToRefresh.fsPath}: ${e}`);
        }
      }
    } else {
      vscode.window.showErrorMessage(`✗ Ruff command failed`, 'Show Output').then(selection => {
        if (selection === 'Show Output') {
          outputService.show();
        }
      });
    }

    return commandResult;
  }

  /**
   * Format a single Python file.
   */
  public async formatFile(uri: vscode.Uri, silent = false, token?: vscode.CancellationToken): Promise<RuffCommandResult> {
    const cwd = getWorkspacePath(uri);
    const relativePath = cwd ? path.relative(cwd, uri.fsPath) : uri.fsPath;
    return this.runRuffCommand(
      ['format', uri.fsPath],
      cwd,
      'format',
      `Formatted ${relativePath}`,
      uri,
      silent,
      token
    );
  }

  /**
   * Check a single Python file.
   */
  public async checkFile(uri: vscode.Uri, silent = false, token?: vscode.CancellationToken): Promise<RuffCommandResult> {
    const cwd = getWorkspacePath(uri);
    const relativePath = cwd ? path.relative(cwd, uri.fsPath) : uri.fsPath;
    return this.runRuffCommand(
      ['check', uri.fsPath],
      cwd,
      'check',
      `Checked ${relativePath}`,
      uri,
      silent,
      token
    );
  }

  /**
   * Fix issues in a single Python file.
   */
  public async fixIssues(uri: vscode.Uri, silent = false, token?: vscode.CancellationToken): Promise<RuffCommandResult> {
    const cwd = getWorkspacePath(uri);
    const relativePath = cwd ? path.relative(cwd, uri.fsPath) : uri.fsPath;
    return this.runRuffCommand(
      ['check', '--fix', uri.fsPath],
      cwd,
      'fix',
      `Fixed issues in ${relativePath}`,
      uri,
      silent,
      token
    );
  }

  /**
   * Run Check & Fix in sequence.
   */
  public async checkAndFixFile(uri: vscode.Uri, silent = false, token?: vscode.CancellationToken): Promise<RuffCommandResult> {
    const cwd = getWorkspacePath(uri);
    const relativePath = cwd ? path.relative(cwd, uri.fsPath) : uri.fsPath;
    const settings = this.getSettings();
    const ruffPath = await this.resolveRuffPath(uri);

    // 1. Run check --fix
    const fixResult = token ? await executeProcessCancelable(ruffPath, ['check', '--fix', uri.fsPath], { cwd }, token) : await executeProcess(ruffPath, ['check', '--fix', uri.fsPath], { cwd });
    
    // 2. Run format
    const formatResult = token ? await executeProcessCancelable(ruffPath, ['format', uri.fsPath], { cwd }, token) : await executeProcess(ruffPath, ['format', uri.fsPath], { cwd });

    const totalDuration = fixResult.duration + formatResult.duration;
    const isSuccess = (fixResult.code === 0 || fixResult.code === 1) && formatResult.code === 0;

    const commandResult: RuffCommandResult = {
      success: isSuccess,
      message: isSuccess ? `Checked, fixed, and formatted ${relativePath}` : `Check & Fix failed`,
      duration: totalDuration,
      stdout: `${fixResult.stdout}\n${formatResult.stdout}`.trim(),
      stderr: `${fixResult.stderr}\n${formatResult.stderr}`.trim(),
      command: `${ruffPath} check --fix ${uri.fsPath} && ${ruffPath} format ${uri.fsPath}`,
    };

    outputService.logCommandResult(commandResult);

    if (isSuccess) {
      if (settings.showNotifications && !silent) {
        vscode.window.showInformationMessage(`✓ Ruff check & fix completed`);
      }
      
      if (settings.autoRefresh && uri.scheme === 'file') {
        try {
          await vscode.workspace.fs.stat(uri);
        } catch (e) {
          outputService.logError(`Failed to refresh file state for ${uri.fsPath}: ${e}`);
        }
      }
    } else {
      vscode.window.showErrorMessage(`✗ Ruff command failed`, 'Show Output').then(selection => {
        if (selection === 'Show Output') {
          outputService.show();
        }
      });
    }

    return commandResult;
  }

  /**
   * Organize imports in a single Python file.
   */
  public async organizeImports(uri: vscode.Uri, silent = false, token?: vscode.CancellationToken): Promise<RuffCommandResult> {
    const cwd = getWorkspacePath(uri);
    const relativePath = cwd ? path.relative(cwd, uri.fsPath) : uri.fsPath;
    return this.runRuffCommand(
      ['check', '--select', 'I', '--fix', uri.fsPath],
      cwd,
      'organize imports',
      `Organized imports in ${relativePath}`,
      uri,
      silent,
      token
    );
  }

  /**
   * Format the entire workspace at a given path.
   */
  public async formatWorkspace(workspaceRoot: string, silent = false): Promise<RuffCommandResult> {
    const uri = vscode.Uri.file(workspaceRoot);
    return this.runRuffCommand(
      ['format', '.'],
      workspaceRoot,
      'format workspace',
      `Formatted workspace root: ${workspaceRoot}`,
      uri,
      silent
    );
  }

  /**
   * Check the entire workspace at a given path.
   */
  public async checkWorkspace(workspaceRoot: string, silent = false): Promise<RuffCommandResult> {
    const uri = vscode.Uri.file(workspaceRoot);
    return this.runRuffCommand(
      ['check', '.'],
      workspaceRoot,
      'check workspace',
      `Checked workspace root: ${workspaceRoot}`,
      uri,
      silent
    );
  }

  /**
   * Fix issues in the entire workspace at a given path.
   */
  public async fixWorkspace(workspaceRoot: string, silent = false): Promise<RuffCommandResult> {
    const uri = vscode.Uri.file(workspaceRoot);
    return this.runRuffCommand(
      ['check', '--fix', '.'],
      workspaceRoot,
      'fix workspace',
      `Fixed issues in workspace root: ${workspaceRoot}`,
      uri,
      silent
    );
  }
}

export const ruffService = RuffService.getInstance();
