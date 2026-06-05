import * as vscode from 'vscode';
import * as path from 'path';
import { executeProcess } from '../utils/process';
import { getWorkspacePath } from '../utils/fileUtils';
import { outputService } from './outputService';
import { ExtensionSettings, RuffCommandResult } from '../types';

export class RuffService {
  private static instance: RuffService | null = null;

  private constructor() {}

  public static getInstance(): RuffService {
    if (!RuffService.instance) {
      RuffService.instance = new RuffService();
    }
    return RuffService.instance;
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
   * Checks if Ruff is installed by running `<ruffPath> --version`.
   * Displays an error notification if not found.
   */
  public async checkRuffInstalled(): Promise<boolean> {
    const settings = this.getSettings();
    const result = await executeProcess(settings.ruffPath, ['--version']);
    
    if (result.error || result.code !== 0) {
      const errorMsg = 
        `Ruff executable not found.\n` +
        `Please install Ruff:\n\n` +
        `pip install ruff`;
      
      vscode.window.showErrorMessage(errorMsg, { modal: true });
      outputService.logError(`Ruff validation failed. Executable: "${settings.ruffPath}". Stderr: ${result.stderr}`);
      return false;
    }
    
    return true;
  }

  /**
   * Runs a command and logs/displays notifications.
   */
  private async runRuffCommand(
    args: string[],
    cwd: string | undefined,
    actionLabel: string,
    successMessage: string,
    uriToRefresh?: vscode.Uri,
    silent = false
  ): Promise<RuffCommandResult> {
    const settings = this.getSettings();
    const commandStr = `${settings.ruffPath} ${args.join(' ')}`;
    
    const result = await executeProcess(settings.ruffPath, args, { cwd });
    
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
  public async formatFile(uri: vscode.Uri, silent = false): Promise<RuffCommandResult> {
    const cwd = getWorkspacePath(uri);
    const relativePath = cwd ? path.relative(cwd, uri.fsPath) : uri.fsPath;
    return this.runRuffCommand(
      ['format', uri.fsPath],
      cwd,
      'format',
      `Formatted ${relativePath}`,
      uri,
      silent
    );
  }

  /**
   * Check a single Python file.
   */
  public async checkFile(uri: vscode.Uri, silent = false): Promise<RuffCommandResult> {
    const cwd = getWorkspacePath(uri);
    const relativePath = cwd ? path.relative(cwd, uri.fsPath) : uri.fsPath;
    return this.runRuffCommand(
      ['check', uri.fsPath],
      cwd,
      'check',
      `Checked ${relativePath}`,
      uri,
      silent
    );
  }

  /**
   * Fix issues in a single Python file.
   */
  public async fixIssues(uri: vscode.Uri, silent = false): Promise<RuffCommandResult> {
    const cwd = getWorkspacePath(uri);
    const relativePath = cwd ? path.relative(cwd, uri.fsPath) : uri.fsPath;
    return this.runRuffCommand(
      ['check', '--fix', uri.fsPath],
      cwd,
      'fix',
      `Fixed issues in ${relativePath}`,
      uri,
      silent
    );
  }

  /**
   * Run Check & Fix in sequence.
   */
  public async checkAndFixFile(uri: vscode.Uri, silent = false): Promise<RuffCommandResult> {
    const cwd = getWorkspacePath(uri);
    const relativePath = cwd ? path.relative(cwd, uri.fsPath) : uri.fsPath;
    const settings = this.getSettings();

    // 1. Run check --fix
    const fixResult = await executeProcess(settings.ruffPath, ['check', '--fix', uri.fsPath], { cwd });
    
    // 2. Run format
    const formatResult = await executeProcess(settings.ruffPath, ['format', uri.fsPath], { cwd });

    const totalDuration = fixResult.duration + formatResult.duration;
    const isSuccess = (fixResult.code === 0 || fixResult.code === 1) && formatResult.code === 0;

    const commandResult: RuffCommandResult = {
      success: isSuccess,
      message: isSuccess ? `Checked, fixed, and formatted ${relativePath}` : `Check & Fix failed`,
      duration: totalDuration,
      stdout: `${fixResult.stdout}\n${formatResult.stdout}`.trim(),
      stderr: `${fixResult.stderr}\n${formatResult.stderr}`.trim(),
      command: `${settings.ruffPath} check --fix ${uri.fsPath} && ${settings.ruffPath} format ${uri.fsPath}`,
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
  public async organizeImports(uri: vscode.Uri, silent = false): Promise<RuffCommandResult> {
    const cwd = getWorkspacePath(uri);
    const relativePath = cwd ? path.relative(cwd, uri.fsPath) : uri.fsPath;
    return this.runRuffCommand(
      ['check', '--select', 'I', '--fix', uri.fsPath],
      cwd,
      'organize imports',
      `Organized imports in ${relativePath}`,
      uri,
      silent
    );
  }

  /**
   * Format the entire workspace at a given path.
   */
  public async formatWorkspace(workspaceRoot: string, silent = false): Promise<RuffCommandResult> {
    return this.runRuffCommand(
      ['format', '.'],
      workspaceRoot,
      'format workspace',
      `Formatted workspace root: ${workspaceRoot}`,
      undefined,
      silent
    );
  }

  /**
   * Check the entire workspace at a given path.
   */
  public async checkWorkspace(workspaceRoot: string, silent = false): Promise<RuffCommandResult> {
    return this.runRuffCommand(
      ['check', '.'],
      workspaceRoot,
      'check workspace',
      `Checked workspace root: ${workspaceRoot}`,
      undefined,
      silent
    );
  }

  /**
   * Fix issues in the entire workspace at a given path.
   */
  public async fixWorkspace(workspaceRoot: string, silent = false): Promise<RuffCommandResult> {
    return this.runRuffCommand(
      ['check', '--fix', '.'],
      workspaceRoot,
      'fix workspace',
      `Fixed issues in workspace root: ${workspaceRoot}`,
      undefined,
      silent
    );
  }
}

export const ruffService = RuffService.getInstance();
