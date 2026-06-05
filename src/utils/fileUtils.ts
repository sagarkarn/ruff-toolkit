import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Checks if a URI represents a Python file.
 */
export function isPythonFile(uri: vscode.Uri): boolean {
  return path.extname(uri.fsPath).toLowerCase() === '.py';
}

/**
 * Gets the workspace folder path for a given URI.
 * Falls back to the first workspace folder if no specific URI is associated.
 */
export function getWorkspacePath(uri?: vscode.Uri): string | undefined {
  if (uri) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      return workspaceFolder.uri.fsPath;
    }
  }

  // Fallback to first workspace folder if open
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }

  return undefined;
}

/**
 * Gets all active workspace folder paths.
 */
export function getAllWorkspacePaths(): string[] {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders.map(folder => folder.uri.fsPath);
  }
  return [];
}
