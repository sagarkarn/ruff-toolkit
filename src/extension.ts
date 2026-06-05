import * as vscode from 'vscode';
import { registerFormatCommands } from './commands/format';
import { registerCheckCommands } from './commands/check';
import { registerFixCommands } from './commands/fix';
import { registerOrganizeImportsCommands } from './commands/organizeImports';
import { outputService } from './services/outputService';

/**
 * Activated when the extension is loaded.
 */
export function activate(context: vscode.ExtensionContext): void {
  outputService.logInfo('Ruff Toolkit extension is now active!');

  // Register all commands
  registerFormatCommands(context);
  registerCheckCommands(context);
  registerFixCommands(context);
  registerOrganizeImportsCommands(context);

  // Add output service to subscriptions to ensure it is disposed correctly
  context.subscriptions.push(outputService);
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  outputService.logInfo('Ruff Toolkit extension is deactivated.');
}
