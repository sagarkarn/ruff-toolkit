import * as vscode from 'vscode';
import { ruffService } from './services/ruffService';
import { registerFormatCommands } from './commands/format';
import { registerCheckCommands } from './commands/check';
import { registerFixCommands } from './commands/fix';
import { registerOrganizeImportsCommands } from './commands/organizeImports';
import { outputService } from './services/outputService';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

/**
 * Activated when the extension is loaded.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputService.logInfo('Ruff Toolkit extension is now active!');

  // Register all commands
  registerFormatCommands(context);
  registerCheckCommands(context);
  registerFixCommands(context);
  registerOrganizeImportsCommands(context);

  // Register new utility commands
  const showVersionCmd = vscode.commands.registerCommand('ruffToolkit.showVersion', async () => {
    const activeEditor = vscode.window.activeTextEditor;
    const uri = activeEditor?.document.uri;
    const result = await ruffService.checkRuffInstalled(uri);
    if (result) {
      const versionResult = await ruffService.runRuffCommand(['--version'], undefined, 'show version', 'Ruff version', uri, true);
      vscode.window.showInformationMessage(`Ruff version: ${versionResult.stdout.trim()}`);
    }
  });
  const openSettingsCmd = vscode.commands.registerCommand('ruffToolkit.openSettings', () => {
    vscode.commands.executeCommand('workbench.action.openSettings', '@ext:sagarkarn.ruff-toolkit');
  });
  const showOutputCmd = vscode.commands.registerCommand('ruffToolkit.showOutput', () => {
    outputService.show();
  });
  context.subscriptions.push(showVersionCmd, openSettingsCmd, showOutputCmd);

  // Helper function to start the language client
  const startLanguageClient = async () => {
    const folders = vscode.workspace.workspaceFolders;
    const firstFolderUri = folders && folders.length > 0 ? folders[0].uri : undefined;
    const installed = await ruffService.checkRuffInstalled(firstFolderUri);
    if (installed) {
      const resolvedRuffPath = await ruffService.resolveRuffPath(firstFolderUri);
      const serverOptions: ServerOptions = {
        command: resolvedRuffPath,
        args: ['server'],
      };
      const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'python' }],
      };
      client = new LanguageClient('ruff', 'Ruff Language Server', serverOptions, clientOptions);
      try {
        await client.start();
        outputService.logInfo(`Ruff Language client started using executable: ${resolvedRuffPath}`);
      } catch (err) {
        outputService.logError(`Failed to start Ruff Language Server: ${err}`);
      }
    }
  };

  // Helper function to stop the language client
  const stopLanguageClient = async () => {
    if (client) {
      try {
        await client.stop();
        outputService.logInfo('Ruff Language client stopped.');
      } catch (err) {
        outputService.logError(`Error stopping Ruff Language client: ${err}`);
      }
      client = undefined;
    }
  };

  await startLanguageClient();

  // Listen for configuration changes
  const configListener = vscode.workspace.onDidChangeConfiguration(async e => {
    if (e.affectsConfiguration('ruffToolkit')) {
      // Force refresh of settings on next command execution (settings are read lazily)
      outputService.logInfo('Ruff Toolkit configuration changed.');
      
      if (e.affectsConfiguration('ruffToolkit.ruffPath')) {
        outputService.logInfo('Ruff path changed. Restarting language client...');
        await stopLanguageClient();
        await startLanguageClient();
      }
    }
  });
  context.subscriptions.push(configListener);

  // Add output service to subscriptions to ensure it is disposed correctly
  context.subscriptions.push(outputService);
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): Thenable<void> | undefined {
  // Dispose diagnostic collection if exists
  ruffService.disposeDiagnostics();
  outputService.logInfo('Ruff Toolkit extension is deactivated.');
  if (client) {
    return client.stop();
  }
}
