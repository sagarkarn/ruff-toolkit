import * as vscode from 'vscode';
import * as path from 'path';
import { executeProcess } from '../utils/process';
import { fileExists, getAllWorkspacePaths, isPythonFile } from '../utils/fileUtils';
import { outputService } from './outputService';
import { ChangedFilesResult } from '../types';

interface GitChange {
  uri: vscode.Uri;
  status?: number;
}

interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    workingTreeChanges?: GitChange[];
    indexChanges?: GitChange[];
    untrackedChanges?: GitChange[];
  };
}

interface GitAPI {
  repositories: GitRepository[];
}

interface GitExtension {
  getAPI(version: 1): GitAPI;
}

// Deleted status codes in vscode.git Status enum:
// INDEX_DELETED = 2, DELETED = 6, DELETED_BY_US = 14, DELETED_BY_THEM = 15, BOTH_DELETED = 17
const DELETED_STATUS_CODES = new Set([2, 6, 14, 15, 17]);

export class GitService {
  private static instance: GitService | null = null;

  private constructor() {}

  public static getInstance(): GitService {
    if (!GitService.instance) {
      GitService.instance = new GitService();
    }
    return GitService.instance;
  }

  /**
   * Retrieves all changed Python files (.py, .pyi) in the open workspace folders using Git.
   * Tries VS Code's official Git extension first, then falls back to git status CLI.
   */
  public async getChangedPythonFiles(): Promise<ChangedFilesResult> {
    const urisMap = new Map<string, vscode.Uri>();
    let isGitRepo = false;

    // 1. Try VS Code Git extension API
    try {
      const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
      if (gitExtension) {
        if (!gitExtension.isActive) {
          await gitExtension.activate();
        }
        const gitApi = gitExtension.exports?.getAPI?.(1);
        if (gitApi && Array.isArray(gitApi.repositories) && gitApi.repositories.length > 0) {
          isGitRepo = true;
          for (const repo of gitApi.repositories) {
            const state = repo.state;
            const changes: GitChange[] = [
              ...(state?.workingTreeChanges || []),
              ...(state?.indexChanges || []),
              ...(state?.untrackedChanges || []),
            ];

            for (const change of changes) {
              if (!change.uri || change.uri.scheme !== 'file') {
                continue;
              }

              if (change.status !== undefined && DELETED_STATUS_CODES.has(change.status)) {
                continue;
              }

              if (isPythonFile(change.uri) && (await fileExists(change.uri.fsPath))) {
                urisMap.set(change.uri.fsPath, change.uri);
              }
            }
          }

          outputService.logInfo(
            `GitService: Detected ${urisMap.size} changed Python file(s) via VS Code Git API.`
          );
          return {
            isGitRepo: true,
            uris: Array.from(urisMap.values()),
          };
        }
      }
    } catch (err) {
      outputService.logError(`GitService: Error querying VS Code Git API: ${err}`);
    }

    // 2. Fallback to CLI git status --porcelain=v1 -uall
    const workspacePaths = getAllWorkspacePaths();
    for (const root of workspacePaths) {
      const result = await executeProcess('git', ['status', '--porcelain=v1', '-uall'], { cwd: root });
      if (result.code === 0) {
        isGitRepo = true;
        const lines = result.stdout.split(/\r?\n/);
        for (const rawLine of lines) {
          const line = rawLine.trimEnd();
          if (!line || line.length < 4) {
            continue;
          }

          const statusCode = line.substring(0, 2);
          // If marked deleted in index or worktree, skip
          if (statusCode.includes('D')) {
            continue;
          }

          let relPath = line.substring(3).trim();
          // If renamed: R  orig.py -> new.py
          if (relPath.includes(' -> ')) {
            const parts = relPath.split(' -> ');
            relPath = parts[parts.length - 1].trim();
          }

          // Strip surrounding quotes if present
          if (relPath.startsWith('"') && relPath.endsWith('"')) {
            relPath = relPath.substring(1, relPath.length - 1).replace(/\\"/g, '"');
          }

          const absPath = path.isAbsolute(relPath) ? relPath : path.resolve(root, relPath);
          const uri = vscode.Uri.file(absPath);

          if (isPythonFile(uri) && (await fileExists(absPath))) {
            urisMap.set(uri.fsPath, uri);
          }
        }
      } else {
        outputService.logInfo(
          `GitService: 'git status' failed for workspace '${root}': ${result.stderr || 'exit code ' + result.code}`
        );
      }
    }

    outputService.logInfo(
      `GitService: Detected ${urisMap.size} changed Python file(s) via Git CLI. (isGitRepo: ${isGitRepo})`
    );

    return {
      isGitRepo,
      uris: Array.from(urisMap.values()),
    };
  }
}

export const gitService = GitService.getInstance();
