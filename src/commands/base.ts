import * as vscode from 'vscode';
import { isPythonFile, getAllWorkspacePaths } from '../utils/fileUtils';
import { ruffService } from '../services/ruffService';
import { outputService } from '../services/outputService';
import { RuffCommandResult } from '../types';

/**
 * Resolves the target URIs for file commands.
 * Handles Explorer multi-select, context menus, and active editor fallbacks.
 */
export function getTargetUris(uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined): vscode.Uri[] {
  if (uris && uris.length > 0) {
    return uris.filter(u => u.scheme === 'file' && isPythonFile(u));
  }
  
  if (uri && uri.scheme === 'file' && isPythonFile(uri)) {
    return [uri];
  }
  
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && activeEditor.document.uri.scheme === 'file' && isPythonFile(activeEditor.document.uri)) {
    return [activeEditor.document.uri];
  }
  
  return [];
}

/**
 * Standard runner for file-based actions, wrapping multi-file with a progress bar.
 */
export async function runFileAction(
  uri: vscode.Uri | undefined,
  uris: vscode.Uri[] | undefined,
  actionLabel: string,
  fileAction: (uri: vscode.Uri, silent: boolean, token?: vscode.CancellationToken) => Promise<RuffCommandResult>
): Promise<void> {
  const targets = getTargetUris(uri, uris);
  if (targets.length === 0) {
    vscode.window.showWarningMessage(`No Python files selected to ${actionLabel}.`);
    return;
  }

  const installed = await ruffService.checkRuffInstalled(targets[0]);
  if (!installed) {
    return;
  }

  if (targets.length === 1) {
    // Single file execution - run with silent = false (it will show its own notifications)
    await fileAction(targets[0], false);
  } else {
    // Multi-file execution with progress - run with silent = true to avoid toast flood
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Ruff: Processing ${targets.length} files...`,
      cancellable: true
    }, async (progress, token) => {
      let completedCount = 0;
      let totalViolations = 0;
      let hasViolations = false;
      
      for (const target of targets) {
        if (token.isCancellationRequested) {
          vscode.window.showInformationMessage(`Ruff: Action cancelled.`);
          break;
        }
        
        const relativeName = vscode.workspace.asRelativePath(target) || target.fsPath;
        progress.report({
          message: `Processing ${relativeName}`,
          increment: (1 / targets.length) * 100
        });

        const result = await fileAction(target, true, token);
        if (result.success) {
          completedCount++;
          if (result.violationsCount !== undefined) {
            totalViolations += result.violationsCount;
            if (result.violationsCount > 0) {
              hasViolations = true;
            }
          }
        }
      }
      
      const settings = ruffService.getSettings();
      if (settings.showNotifications) {
        if (actionLabel === 'check') {
          if (hasViolations) {
            vscode.window.showWarningMessage(
              `⚠ Ruff check completed: found ${totalViolations} issues across ${completedCount} files.`,
              'Show Output'
            ).then(selection => {
              if (selection === 'Show Output') {
                outputService.show();
              }
            });
          } else {
            vscode.window.showInformationMessage(`✓ Ruff check completed: no issues found in ${completedCount} files.`);
          }
        } else {
          vscode.window.showInformationMessage(`✓ Ruff ${actionLabel} completed for ${completedCount} of ${targets.length} files.`);
        }
      }
    });
  }
}

/**
 * Standard runner for workspace-wide actions.
 */
export async function runWorkspaceAction(
  actionLabel: string,
  workspaceAction: (workspaceRoot: string, silent: boolean, token?: vscode.CancellationToken) => Promise<RuffCommandResult>
): Promise<void> {
  const workspacePaths = getAllWorkspacePaths();
  if (workspacePaths.length === 0) {
    vscode.window.showWarningMessage(`No workspace folders open to ${actionLabel}.`);
    return;
  }

  const installed = await ruffService.checkRuffInstalled(vscode.Uri.file(workspacePaths[0]));
  if (!installed) {
    return;
  }

  if (workspacePaths.length === 1) {
    // Single workspace folder
    await workspaceAction(workspacePaths[0], false);
  } else {
    // Multi-folder workspace with progress
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Ruff: Processing workspaces...`,
      cancellable: true
    }, async (progress, token) => {
      let completedCount = 0;
      let totalViolations = 0;
      let hasViolations = false;
      
      for (const workspacePath of workspacePaths) {
        if (token.isCancellationRequested) {
          vscode.window.showInformationMessage(`Ruff: Action cancelled.`);
          break;
        }
        
        const folderName = vscode.workspace.workspaceFolders?.find(f => f.uri.fsPath === workspacePath)?.name || workspacePath;
        progress.report({
          message: `Processing workspace folder: ${folderName}`,
          increment: (1 / workspacePaths.length) * 100
        });

        const result = await workspaceAction(workspacePath, true, token);
        if (result.success) {
          completedCount++;
          if (result.violationsCount !== undefined) {
            totalViolations += result.violationsCount;
            if (result.violationsCount > 0) {
              hasViolations = true;
            }
          }
        }
      }
      
      const settings = ruffService.getSettings();
      if (settings.showNotifications) {
        if (actionLabel === 'check workspace') {
          if (hasViolations) {
            vscode.window.showWarningMessage(
              `⚠ Ruff check completed: found ${totalViolations} issues across ${completedCount} workspace folders.`,
              'Show Output'
            ).then(selection => {
              if (selection === 'Show Output') {
                outputService.show();
              }
            });
          } else {
            vscode.window.showInformationMessage(`✓ Ruff check completed: no issues found in ${completedCount} workspace folders.`);
          }
        } else {
          vscode.window.showInformationMessage(`✓ Ruff ${actionLabel} completed for ${completedCount} of ${workspacePaths.length} workspace folders.`);
        }
      }
    });
  }
}
