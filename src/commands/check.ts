import * as vscode from 'vscode';
import { runFileAction, runWorkspaceAction } from './base';
import { ruffService } from '../services/ruffService';

export function registerCheckCommands(context: vscode.ExtensionContext): void {
  // 1. Check File / Selected Files
  const checkFileCmd = vscode.commands.registerCommand(
    'ruffToolkit.checkFile',
    async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      await runFileAction(uri, uris, 'check', (target, silent) =>
        ruffService.checkFile(target, silent)
      );
    }
  );

  // 2. Check Workspace
  const checkWorkspaceCmd = vscode.commands.registerCommand(
    'ruffToolkit.checkWorkspace',
    async () => {
      await runWorkspaceAction('check workspace', (root, silent) =>
        ruffService.checkWorkspace(root, silent)
      );
    }
  );

  context.subscriptions.push(checkFileCmd, checkWorkspaceCmd);
}
