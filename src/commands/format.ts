import * as vscode from 'vscode';
import { runFileAction, runWorkspaceAction } from './base';
import { ruffService } from '../services/ruffService';

export function registerFormatCommands(context: vscode.ExtensionContext): void {
  // 1. Format File / Selected Files
  const formatFileCmd = vscode.commands.registerCommand(
    'ruffToolkit.formatFile',
    async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      await runFileAction(uri, uris, 'format', (target, silent) => 
        ruffService.formatFile(target, silent)
      );
    }
  );

  // 2. Format Workspace
  const formatWorkspaceCmd = vscode.commands.registerCommand(
    'ruffToolkit.formatWorkspace',
    async () => {
      await runWorkspaceAction('format workspace', (root, silent) =>
        ruffService.formatWorkspace(root, silent)
      );
    }
  );

  context.subscriptions.push(formatFileCmd, formatWorkspaceCmd);
}
