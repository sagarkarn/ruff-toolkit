import * as vscode from 'vscode';
import { runFileAction } from './base';
import { ruffService } from '../services/ruffService';

export function registerOrganizeImportsCommands(context: vscode.ExtensionContext): void {
  // Organize Imports File / Selected Files
  const organizeImportsCmd = vscode.commands.registerCommand(
    'ruffToolkit.organizeImports',
    async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      await runFileAction(uri, uris, 'organize imports', (target, silent) =>
        ruffService.organizeImports(target, silent)
      );
    }
  );

  context.subscriptions.push(organizeImportsCmd);
}
