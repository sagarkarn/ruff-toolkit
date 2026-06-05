import * as vscode from 'vscode';
import { RuffCommandResult } from '../types';

export class OutputService implements vscode.Disposable {
  private static instance: OutputService | null = null;
  private channel: vscode.OutputChannel;

  private constructor() {
    this.channel = vscode.window.createOutputChannel('Ruff Toolkit');
  }

  public static getInstance(): OutputService {
    if (!OutputService.instance) {
      OutputService.instance = new OutputService();
    }
    return OutputService.instance;
  }

  /**
   * Logs an info message.
   */
  public logInfo(message: string): void {
    this.channel.appendLine(`[INFO] ${message}`);
  }

  /**
   * Logs a success message.
   */
  public logSuccess(message: string): void {
    this.channel.appendLine(`[SUCCESS] ${message}`);
  }

  /**
   * Logs an error message.
   */
  public logError(message: string): void {
    this.channel.appendLine(`[ERROR] ${message}`);
  }

  /**
   * Logs the execution details of a Ruff command.
   */
  public logCommandResult(result: RuffCommandResult): void {
    this.channel.appendLine(`[INFO] Running: ${result.command}`);
    this.channel.appendLine('');
    
    if (result.success) {
      this.channel.appendLine('[SUCCESS]');
      if (result.stdout.trim()) {
        this.channel.appendLine(result.stdout.trim());
      } else if (result.stderr.trim()) {
        // Sometimes successfully completed commands output details on stderr
        this.channel.appendLine(result.stderr.trim());
      } else {
        this.channel.appendLine(result.message);
      }
    } else {
      this.channel.appendLine('[ERROR]');
      if (result.stderr.trim()) {
        this.channel.appendLine(result.stderr.trim());
      }
      if (result.stdout.trim()) {
        this.channel.appendLine(result.stdout.trim());
      }
      if (!result.stderr.trim() && !result.stdout.trim()) {
        this.channel.appendLine(result.message);
      }
    }
    
    this.channel.appendLine('');
    this.channel.appendLine(`Time: ${result.duration}ms`);
    this.channel.appendLine('--------------------------------------------------');
  }

  /**
   * Shows the output channel.
   */
  public show(): void {
    this.channel.show(true);
  }

  /**
   * Disposes the output channel.
   */
  public dispose(): void {
    this.channel.dispose();
  }
}

export const outputService = OutputService.getInstance();
