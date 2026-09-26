import * as vscode from 'vscode';
import * as path from 'path';
import { executeProcess, executeProcessCancelable } from '../utils/process';
import { ruffService } from './ruffService';
import { outputService } from './outputService';
import { getWorkspacePath } from '../utils/fileUtils';
import {
  DashboardData,
  OccurrenceLocation,
  RuleFileOccurrence,
  RuleSummary,
  RuffRawViolation,
} from '../types';

export class DashboardService {
  private static instance: DashboardService | null = null;

  private constructor() {}

  public static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
    }
    return DashboardService.instance;
  }

  /**
   * Identifies rule category based on standard Ruff rule prefix.
   */
  private getCategory(code: string): string {
    if (code.startsWith('F')) {
      return 'Pyflakes';
    }
    if (code.startsWith('E') || code.startsWith('W')) {
      return 'pycodestyle';
    }
    if (code.startsWith('I')) {
      return 'isort';
    }
    if (code.startsWith('UP')) {
      return 'pyupgrade';
    }
    if (code.startsWith('B')) {
      return 'flake8-bugbear';
    }
    if (code.startsWith('C4')) {
      return 'flake8-comprehensions';
    }
    if (code.startsWith('C90')) {
      return 'mccabe';
    }
    if (code.startsWith('D')) {
      return 'pydocstyle';
    }
    if (code.startsWith('SIM')) {
      return 'flake8-simplify';
    }
    if (code.startsWith('S')) {
      return 'flake8-bandit';
    }
    if (code.startsWith('A')) {
      return 'flake8-builtins';
    }
    if (code.startsWith('RUF')) {
      return 'Ruff-specific';
    }
    return 'Linter';
  }

  /**
   * Classifies violation severity into 'error' or 'warning'.
   */
  private getSeverity(code: string, rawSeverity?: string): 'error' | 'warning' {
    if (rawSeverity === 'warning') {
      return 'warning';
    }
    if (rawSeverity === 'error') {
      return 'error';
    }
    // Fallback heuristic based on common rule prefixes
    if (code.startsWith('W') || code.startsWith('D') || code.startsWith('UP') || code.startsWith('I')) {
      return 'warning';
    }
    return 'error';
  }

  /**
   * Scans the workspace and collects aggregated health metrics.
   */
  public async getDashboardData(
    workspaceUri?: vscode.Uri,
    token?: vscode.CancellationToken
  ): Promise<DashboardData> {
    const workspaceRoot = getWorkspacePath(workspaceUri);
    if (!workspaceRoot) {
      throw new Error('No workspace folder open to analyze.');
    }

    const folder = vscode.workspace.workspaceFolders?.find(f => f.uri.fsPath === workspaceRoot);
    const workspaceName = folder ? folder.name : path.basename(workspaceRoot);

    const ruffPath = await ruffService.resolveRuffPath(workspaceUri || (folder ? folder.uri : undefined));
    const args = ['check', '--output-format', 'json', '.'];

    outputService.logInfo(`DashboardService: Scanning workspace at '${workspaceRoot}' with command '${ruffPath} ${args.join(' ')}'`);

    const startTime = Date.now();
    const result = token
      ? await executeProcessCancelable(ruffPath, args, { cwd: workspaceRoot }, token)
      : await executeProcess(ruffPath, args, { cwd: workspaceRoot });

    const scanDuration = Date.now() - startTime;

    if (result.code !== 0 && result.code !== 1) {
      const errorMsg = result.stderr || result.error?.message || `Ruff exited with code ${result.code}`;
      outputService.logError(`DashboardService: Scan failed: ${errorMsg}`);
      throw new Error(`Ruff scan failed: ${errorMsg}`);
    }

    const hasPythonFiles = !result.stderr.toLowerCase().includes('no python files found');

    let violations: RuffRawViolation[] = [];
    const trimmedStdout = result.stdout.trim();
    if (trimmedStdout && trimmedStdout.startsWith('[') && trimmedStdout.endsWith(']')) {
      try {
        violations = JSON.parse(trimmedStdout);
      } catch (err) {
        outputService.logError(`DashboardService: Failed to parse JSON output: ${err}`);
      }
    }

    // Aggregations
    let errorCount = 0;
    let warningCount = 0;
    let autoFixableCount = 0;
    let safeFixableCount = 0;
    const affectedFilesSet = new Set<string>();

    interface RuleAccumulator {
      code: string;
      name: string;
      description: string;
      url?: string;
      category: string;
      severity: 'error' | 'warning';
      count: number;
      fixableCount: number;
      fileMap: Map<string, { relativePath: string; occurrences: OccurrenceLocation[] }>;
    }

    const ruleMap = new Map<string, RuleAccumulator>();

    for (const v of violations) {
      const severity = this.getSeverity(v.code, v.severity);
      if (severity === 'error') {
        errorCount++;
      } else {
        warningCount++;
      }

      const isFixable = !!v.fix;
      if (isFixable) {
        autoFixableCount++;
        if (v.fix?.applicability === 'safe') {
          safeFixableCount++;
        }
      }

      affectedFilesSet.add(v.filename);

      if (!ruleMap.has(v.code)) {
        ruleMap.set(v.code, {
          code: v.code,
          name: v.name || v.code,
          description: v.message,
          url: v.url,
          category: this.getCategory(v.code),
          severity,
          count: 0,
          fixableCount: 0,
          fileMap: new Map(),
        });
      }

      const acc = ruleMap.get(v.code)!;
      acc.count++;
      if (isFixable) {
        acc.fixableCount++;
      }

      const relPath = path.isAbsolute(v.filename)
        ? path.relative(workspaceRoot, v.filename)
        : v.filename;

      if (!acc.fileMap.has(v.filename)) {
        acc.fileMap.set(v.filename, {
          relativePath: relPath || v.filename,
          occurrences: [],
        });
      }

      const fileEntry = acc.fileMap.get(v.filename)!;
      fileEntry.occurrences.push({
        line: v.location.row,
        column: v.location.column,
        endLine: v.end_location?.row ?? v.location.row,
        endColumn: v.end_location?.column ?? v.location.column,
        message: v.message,
        fixable: isFixable,
        fixMessage: v.fix?.message,
      });
    }

    const topRules: RuleSummary[] = Array.from(ruleMap.values())
      .map(acc => {
        const files: RuleFileOccurrence[] = Array.from(acc.fileMap.entries()).map(([fn, entry]) => ({
          filename: fn,
          relativePath: entry.relativePath,
          count: entry.occurrences.length,
          occurrences: entry.occurrences.sort((a, b) => a.line - b.line),
        }));

        files.sort((a, b) => b.count - a.count);

        return {
          code: acc.code,
          name: acc.name,
          description: acc.description,
          count: acc.count,
          fixableCount: acc.fixableCount,
          url: acc.url,
          category: acc.category,
          severity: acc.severity,
          files,
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      scannedAt: Date.now(),
      scanDuration,
      workspaceRoot,
      workspaceName,
      totalIssues: violations.length,
      errorCount,
      warningCount,
      autoFixableCount,
      safeFixableCount,
      affectedFilesCount: affectedFilesSet.size,
      hasPythonFiles,
      topRules,
    };
  }
}

export const dashboardService = DashboardService.getInstance();
