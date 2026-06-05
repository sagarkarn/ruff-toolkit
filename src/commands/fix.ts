import * as vscode from 'vscode';
import { runFileAction, runWorkspaceAction } from './base';
import { ruffService } from '../services/ruffService';

export function registerFixCommands(context: vscode.ExtensionContext): void {
  // 1. Fix Issues File / Selected Files
  const fixIssuesCmd = vscode.commands.registerCommand(
    'ruffToolkit.fixIssues',
    async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      await runFileAction(uri, uris, 'fix issues', (target, silent) =>
        ruffService.fixIssues(target, silent)
      );
    }
  );

  // 2. Check & Fix File / Selected Files
  const checkAndFixCmd = vscode.commands.registerCommand(
    'ruffToolkit.checkAndFix',
    async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      await runFileAction(uri, uris, 'check & fix', (target, silent) =>
        ruffService.checkAndFixFile(target, silent)
      );
    }
  );

  // 3. Fix Workspace
  const fixWorkspaceCmd = vscode.commands.registerCommand(
    'ruffToolkit.fixWorkspace',
    async () => {
      await runWorkspaceAction('fix workspace', (root, silent) =>
        ruffService.fixWorkspace(root, silent)
      );
    }
  );

  context.subscriptions.push(fixIssuesCmd, checkAndFixCmd, fixWorkspaceCmd);
}
