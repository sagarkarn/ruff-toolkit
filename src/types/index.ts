export interface ExtensionSettings {
  ruffPath: string;
  showNotifications: boolean;
  autoRefresh: boolean;
}

export interface ProcessResult {
  code: number | string | null;
  stdout: string;
  stderr: string;
  duration: number; // in milliseconds
  error?: Error;
}

export interface RuffCommandResult {
  success: boolean;
  message: string;
  duration: number;
  stdout: string;
  stderr: string;
  command: string;
  violationsCount?: number;
}
