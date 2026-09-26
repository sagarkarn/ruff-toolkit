import * as vscode from 'vscode';
import { runChangedFilesAction } from './base';
import { ruffService } from '../services/ruffService';

export function registerChangedFilesCommands(context: vscode.ExtensionContext): void {
  // 1. Check Changed Files
  const checkChangedFilesCmd = vscode.commands.registerCommand(
    'ruffToolkit.checkChangedFiles',
    async () => {
      await runChangedFilesAction('check', (target, silent, token) =>
        ruffService.checkFile(target, silent, token)
      );
    }
  );

  // 2. Fix Changed Files
  const fixChangedFilesCmd = vscode.commands.registerCommand(
    'ruffToolkit.fixChangedFiles',
    async () => {
      await runChangedFilesAction('fix', (target, silent, token) =>
        ruffService.fixIssues(target, silent, token)
      );
    }
  );

  // 3. Format Changed Files
  const formatChangedFilesCmd = vscode.commands.registerCommand(
    'ruffToolkit.formatChangedFiles',
    async () => {
      await runChangedFilesAction('format', (target, silent, token) =>
        ruffService.formatFile(target, silent, token)
      );
    }
  );

  // 4. Check & Fix Changed Files
  const checkAndFixChangedFilesCmd = vscode.commands.registerCommand(
    'ruffToolkit.checkAndFixChangedFiles',
    async () => {
      await runChangedFilesAction('check & fix', (target, silent, token) =>
        ruffService.checkAndFixFile(target, silent, token)
      );
    }
  );

  context.subscriptions.push(
    checkChangedFilesCmd,
    fixChangedFilesCmd,
    formatChangedFilesCmd,
    checkAndFixChangedFilesCmd
  );
}
