import * as vscode from 'vscode';
import { DashboardPanel } from '../panels/dashboardPanel';

export function registerDashboardCommands(context: vscode.ExtensionContext): void {
  const openDashboardCmd = vscode.commands.registerCommand(
    'ruffToolkit.openDashboard',
    (uri?: vscode.Uri) => {
      const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
      DashboardPanel.createOrShow(context.extensionUri, targetUri);
    }
  );

  context.subscriptions.push(openDashboardCmd);
}
