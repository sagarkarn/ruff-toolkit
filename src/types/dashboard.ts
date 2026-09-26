export interface RuffRawViolation {
  code: string;
  message: string;
  name: string;
  filename: string;
  location: { row: number; column: number };
  end_location: { row: number; column: number };
  fix: { applicability: string; message: string; edits: unknown[] } | null;
  noqa_row?: number;
  url?: string;
  severity?: string;
}

export interface OccurrenceLocation {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  fixable: boolean;
  fixMessage?: string;
}

export interface RuleFileOccurrence {
  filename: string;
  relativePath: string;
  count: number;
  occurrences: OccurrenceLocation[];
}

export interface RuleSummary {
  code: string;
  name: string;
  description: string;
  count: number;
  fixableCount: number;
  url?: string;
  category: string;
  severity: 'error' | 'warning';
  files: RuleFileOccurrence[];
}

export interface DashboardData {
  scannedAt: number;
  scanDuration: number;
  workspaceRoot: string;
  workspaceName: string;
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  autoFixableCount: number;
  safeFixableCount: number;
  affectedFilesCount: number;
  hasPythonFiles: boolean;
  topRules: RuleSummary[];
}

