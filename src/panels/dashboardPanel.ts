import * as vscode from 'vscode';
import { dashboardService } from '../services/dashboardService';
import { ruffService } from '../services/ruffService';
import { outputService } from '../services/outputService';
import { DashboardData } from '../types';

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private currentWorkspaceUri?: vscode.Uri;
  private lastData?: DashboardData;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, workspaceUri?: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.currentWorkspaceUri = workspaceUri;

    // Show loading state immediately so the user never sees a blank webview
    this.panel.webview.html = this.getLoadingHtml();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'openLocation': {
            try {
              const doc = await vscode.workspace.openTextDocument(message.filename);
              const editor = await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false,
              });
              const line = Math.max(0, (message.line ?? 1) - 1);
              const col = Math.max(0, (message.column ?? 1) - 1);
              const endLine = Math.max(0, (message.endLine ?? message.line ?? 1) - 1);
              const endCol = Math.max(0, (message.endColumn ?? message.column ?? 1) - 1);
              const range = new vscode.Range(line, col, endLine, endCol);
              editor.selection = new vscode.Selection(range.start, range.end);
              editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            } catch (err) {
              vscode.window.showErrorMessage(`Failed to open file: ${err}`);
            }
            break;
          }
          case 'fixAll': {
            if (this.lastData?.workspaceRoot) {
              await vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: 'Ruff: Applying auto-fixes to workspace...',
                  cancellable: false,
                },
                async () => {
                  await ruffService.fixWorkspace(this.lastData!.workspaceRoot, true);
                  await this.refresh();
                }
              );
              vscode.window.showInformationMessage('✓ Ruff: Workspace auto-fixes applied.');
            }
            break;
          }
          case 'formatAll': {
            if (this.lastData?.workspaceRoot) {
              await vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: 'Ruff: Formatting workspace...',
                  cancellable: false,
                },
                async () => {
                  await ruffService.formatWorkspace(this.lastData!.workspaceRoot, true);
                  await this.refresh();
                }
              );
              vscode.window.showInformationMessage('✓ Ruff: Workspace formatted.');
            }
            break;
          }
          case 'refresh': {
            await this.refresh();
            break;
          }
          case 'openUrl': {
            if (message.url) {
              vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
            break;
          }
          case 'openSettings': {
            vscode.commands.executeCommand('workbench.action.openSettings', '@ext:sagarkarn.ruff-toolkit');
            break;
          }
          case 'showOutput': {
            outputService.show();
            break;
          }
        }
      },
      null,
      this.disposables
    );

    this.refresh();
  }

  public static createOrShow(extensionUri: vscode.Uri, workspaceUri?: vscode.Uri): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.currentWorkspaceUri = workspaceUri;
      DashboardPanel.currentPanel.panel.reveal(column);
      DashboardPanel.currentPanel.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'ruffToolkit.dashboard',
      '📊 Ruff Project Health',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, workspaceUri);
  }

  public async refresh(): Promise<void> {
    this.panel.webview.html = this.getLoadingHtml();
    try {
      const data = await dashboardService.getDashboardData(this.currentWorkspaceUri);
      this.lastData = data;
      this.panel.title = `📊 Ruff Health: ${data.workspaceName}`;
      this.panel.webview.html = this.getHtmlForWebview(data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      outputService.logError(`Dashboard error: ${errorMessage}`);
      this.panel.webview.html = this.getErrorHtml(errorMessage);
    }
  }

  public dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ruff Project Health</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
      padding: 40px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 70vh;
      text-align: center;
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 3px solid rgba(128, 128, 128, 0.2);
      border-top-color: var(--vscode-button-background, #007acc);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h2 {
      font-size: 1.3rem;
      font-weight: 600;
      margin-bottom: 8px;
    }
    p {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9rem;
      max-width: 450px;
    }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <h2>Analyzing Project Health...</h2>
  <p>Running Ruff lint inspection and aggregating rule statistics across the workspace.</p>
</body>
</html>`;
  }

  private getErrorHtml(errorMessage: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ruff Project Health - Error</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
      padding: 40px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 70vh;
    }
    .error-card {
      background-color: var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.05));
      border: 1px solid var(--vscode-inputValidation-errorBorder, #f48771);
      padding: 30px;
      border-radius: 8px;
      max-width: 580px;
      text-align: center;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }
    .error-icon {
      font-size: 2.6rem;
      margin-bottom: 12px;
    }
    h2 {
      margin-top: 0;
      color: var(--vscode-errorForeground, #f48771);
      font-size: 1.3rem;
      margin-bottom: 10px;
    }
    p.msg {
      font-size: 0.9rem;
      margin-bottom: 14px;
      line-height: 1.5;
    }
    .error-detail {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.8rem;
      background-color: rgba(128, 128, 128, 0.1);
      padding: 8px 12px;
      border-radius: 4px;
      word-break: break-all;
      margin-bottom: 20px;
      text-align: left;
    }
    .btn-group {
      display: flex;
      gap: 10px;
      justify-content: center;
      flex-wrap: wrap;
    }
    button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
    }
    button:hover { background-color: var(--vscode-button-hoverBackground); }
    button.secondary {
      background-color: var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.15));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
    }
    button.secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.25));
    }
  </style>
</head>
<body>
  <div class="error-card">
    <div class="error-icon">⚠️</div>
    <h2>Unable to Scan Workspace</h2>
    <p class="msg">Ruff could not complete the health analysis for this project.</p>
    <div class="error-detail">${escapeHtml(errorMessage)}</div>
    <div class="btn-group">
      <button onclick="sendMsg('refresh')">🔄 Retry Scan</button>
      <button class="secondary" onclick="sendMsg('openSettings')">⚙ Configure Ruff Path</button>
      <button class="secondary" onclick="sendMsg('showOutput')">📄 View Output Log</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function sendMsg(cmd) {
      vscode.postMessage({ command: cmd });
    }
  </script>
</body>
</html>`;
  }

  private getHtmlForWebview(data: DashboardData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ruff Project Health</title>
  <style>
    :root {
      --color-error: #f14c4c;
      --color-warning: #cca700;
      --color-success: #73c991;
      --color-info: #3794ff;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
      padding: 24px 32px;
      line-height: 1.5;
    }

    /* Header Bar */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
      flex-wrap: wrap;
      gap: 16px;
    }

    .title-area h1 {
      font-size: 1.6rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .title-area p {
      font-size: 0.85rem;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .actions-bar {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: 1px solid transparent;
      padding: 7px 14px;
      font-size: 0.85rem;
      font-weight: 500;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    .btn-secondary {
      background-color: var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.15));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
    }

    .btn-secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.25));
    }

    /* Cards Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }

    .stat-card {
      background-color: var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.05));
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, rgba(128, 128, 128, 0.2)));
      border-radius: 6px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }

    .stat-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
    }

    .stat-card.total::before { background-color: var(--color-info); }
    .stat-card.errors::before { background-color: var(--color-error); }
    .stat-card.warnings::before { background-color: var(--color-warning); }
    .stat-card.fixable::before { background-color: var(--color-success); }
    .stat-card.files::before { background-color: #a855f7; }

    .stat-label {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }

    .stat-number {
      font-size: 2rem;
      font-weight: 700;
      line-height: 1.1;
    }

    .stat-subtext {
      font-size: 0.75rem;
      color: var(--vscode-descriptionForeground);
      margin-top: 6px;
    }

    /* Search & Filter Toolbar */
    .filter-bar {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .search-box {
      flex: 1;
      min-width: 250px;
      position: relative;
    }

    .search-box input {
      width: 100%;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(128, 128, 128, 0.3));
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.85rem;
      outline: none;
    }

    .search-box input:focus {
      border-color: var(--vscode-focusBorder);
    }

    .filter-pills {
      display: flex;
      gap: 8px;
    }

    .pill {
      background-color: var(--vscode-badge-background, rgba(128, 128, 128, 0.15));
      color: var(--vscode-badge-foreground, var(--vscode-editor-foreground));
      border: 1px solid transparent;
      padding: 6px 12px;
      border-radius: 12px;
      font-size: 0.8rem;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }

    .pill.active {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    /* Rules Section */
    .section-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .rule-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .rule-card {
      background-color: var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.05));
      border: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
      border-radius: 6px;
      overflow: hidden;
      transition: border-color 0.15s ease;
    }

    .rule-card:hover {
      border-color: var(--vscode-focusBorder, rgba(128, 128, 128, 0.4));
    }

    .rule-header {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      user-select: none;
    }

    .chevron {
      font-size: 0.75rem;
      color: var(--vscode-descriptionForeground);
      transition: transform 0.2s ease;
      width: 14px;
      display: inline-block;
    }

    .rule-card.expanded .chevron {
      transform: rotate(90deg);
    }

    .code-badge {
      font-family: var(--vscode-editor-font-family, monospace);
      font-weight: 700;
      font-size: 0.85rem;
      padding: 3px 8px;
      border-radius: 4px;
      background-color: rgba(128, 128, 128, 0.15);
      min-width: 62px;
      text-align: center;
    }

    .severity-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .severity-dot.error { background-color: var(--color-error); }
    .severity-dot.warning { background-color: var(--color-warning); }

    .rule-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .rule-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .rule-name {
      font-weight: 600;
      font-size: 0.9rem;
    }

    .rule-category {
      font-size: 0.75rem;
      padding: 2px 6px;
      border-radius: 3px;
      background-color: rgba(128, 128, 128, 0.12);
      color: var(--vscode-descriptionForeground);
    }

    .rule-desc {
      font-size: 0.8rem;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .rule-badges {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .fixable-badge {
      background-color: rgba(115, 201, 145, 0.15);
      color: var(--color-success);
      border: 1px solid rgba(115, 201, 145, 0.3);
      padding: 3px 8px;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .count-badge {
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 3px 8px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 700;
    }

    .doc-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      font-size: 0.8rem;
      padding: 4px 6px;
      border-radius: 4px;
      cursor: pointer;
    }

    .doc-link:hover {
      text-decoration: underline;
    }

    /* Accordion Body */
    .rule-body {
      display: none;
      border-top: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.15));
      background-color: var(--vscode-editor-background);
      padding: 12px 16px;
    }

    .rule-card.expanded .rule-body {
      display: block;
    }

    .file-group {
      margin-bottom: 12px;
    }

    .file-group:last-child {
      margin-bottom: 0;
    }

    .file-header {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--vscode-textLink-foreground);
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }

    .occurrence-list {
      list-style: none;
      margin-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .occurrence-item {
      font-size: 0.8rem;
      padding: 5px 8px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background 0.1s ease;
    }

    .occurrence-item:hover {
      background-color: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.1));
    }

    .occ-loc {
      font-family: var(--vscode-editor-font-family, monospace);
      color: var(--vscode-editorLineNumber-foreground, #858585);
      margin-right: 8px;
    }

    .occ-msg {
      flex: 1;
      color: var(--vscode-editor-foreground);
    }

    .occ-fix {
      font-size: 0.7rem;
      color: var(--color-success);
      margin-left: 8px;
    }

    /* Special Clean & Empty States */
    .status-card {
      text-align: center;
      padding: 50px 20px;
      background-color: var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.05));
      border: 1px dashed var(--vscode-panel-border, rgba(128, 128, 128, 0.3));
      border-radius: 8px;
      margin-top: 20px;
    }

    .status-icon {
      font-size: 3rem;
      margin-bottom: 12px;
    }

    .status-card h2 {
      font-size: 1.4rem;
      margin-bottom: 6px;
    }

    .status-card p {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9rem;
      max-width: 500px;
      margin: 0 auto 16px auto;
    }
  </style>
</head>
<body>

  <!-- Top Header -->
  <div class="header">
    <div class="title-area">
      <h1>📊 Ruff Project Health</h1>
      <p>Workspace: <strong>${escapeHtml(data.workspaceName)}</strong> &bull; Scanned in ${data.scanDuration}ms &bull; ${new Date(data.scannedAt).toLocaleTimeString()}</p>
    </div>
    <div class="actions-bar">
      <button class="btn btn-secondary" onclick="sendMsg('refresh')">🔄 Refresh</button>
      ${data.autoFixableCount > 0 ? `<button class="btn" onclick="sendMsg('fixAll')">🛠 Fix All (${data.autoFixableCount})</button>` : ''}
      <button class="btn btn-secondary" onclick="sendMsg('formatAll')">🎨 Format Workspace</button>
    </div>
  </div>

  <!-- Metric Stat Cards -->
  <div class="stats-grid">
    <div class="stat-card total">
      <div class="stat-label">Total Issues</div>
      <div class="stat-number">${data.totalIssues}</div>
      <div class="stat-subtext">${data.topRules.length} distinct rules violated</div>
    </div>
    <div class="stat-card errors">
      <div class="stat-label">🔴 Errors</div>
      <div class="stat-number">${data.errorCount}</div>
      <div class="stat-subtext">Require immediate resolution</div>
    </div>
    <div class="stat-card warnings">
      <div class="stat-label">🟡 Warnings</div>
      <div class="stat-number">${data.warningCount}</div>
      <div class="stat-subtext">Style & convention advice</div>
    </div>
    <div class="stat-card fixable">
      <div class="stat-label">🛠 Auto-Fixable</div>
      <div class="stat-number">${data.autoFixableCount}</div>
      <div class="stat-subtext">${data.safeFixableCount} safely resolvable</div>
    </div>
    <div class="stat-card files">
      <div class="stat-label">📁 Files Affected</div>
      <div class="stat-number">${data.affectedFilesCount}</div>
      <div class="stat-subtext">Across scanned workspace</div>
    </div>
  </div>

  ${!data.hasPythonFiles ? `
    <div class="status-card">
      <div class="status-icon">ℹ️</div>
      <h2>No Python Files Detected</h2>
      <p>No Python source files (.py, .pyi) were found in workspace <strong>${escapeHtml(data.workspaceName)}</strong>.</p>
      <button class="btn btn-secondary" onclick="sendMsg('refresh')">🔄 Re-scan Workspace</button>
    </div>
  ` : data.totalIssues === 0 ? `
    <div class="status-card">
      <div class="status-icon">🎉</div>
      <h2 style="color: var(--color-success);">100% Clean! No Issues Found</h2>
      <p>All Python files in this workspace adhere completely to all active Ruff rules and styling conventions.</p>
      <button class="btn btn-secondary" onclick="sendMsg('refresh')">🔄 Re-scan</button>
    </div>
  ` : `
    <!-- Filter Toolbar -->
    <div class="filter-bar">
      <div class="search-box">
        <input type="text" id="searchInput" placeholder="Search by rule code (e.g. F401), description, or file..." />
      </div>
      <div class="filter-pills">
        <button class="pill active" data-filter="all">All (${data.totalIssues})</button>
        <button class="pill" data-filter="fixable">Fixable (${data.autoFixableCount})</button>
        <button class="pill" data-filter="error">Errors (${data.errorCount})</button>
        <button class="pill" data-filter="warning">Warnings (${data.warningCount})</button>
      </div>
    </div>

    <!-- Rules List -->
    <div class="section-title">
      <span>Top Rule Violations</span>
      <span style="font-size: 0.85rem; color: var(--vscode-descriptionForeground); font-weight: normal;">Click any rule to inspect files and exact code lines</span>
    </div>

    <div class="rule-list" id="ruleList">
      ${data.topRules.map(rule => `
        <div class="rule-card" data-code="${escapeHtml(rule.code)}" data-severity="${rule.severity}" data-fixable="${rule.fixableCount > 0}" data-search="${escapeHtml((rule.code + ' ' + rule.name + ' ' + rule.description + ' ' + rule.files.map(f => f.relativePath).join(' ')).toLowerCase())}">
          <div class="rule-header">
            <span class="chevron">▶</span>
            <span class="severity-dot ${rule.severity}"></span>
            <span class="code-badge">${escapeHtml(rule.code)}</span>
            <div class="rule-info">
              <div class="rule-name-row">
                <span class="rule-name">${escapeHtml(rule.name)}</span>
                <span class="rule-category">${escapeHtml(rule.category)}</span>
              </div>
              <div class="rule-desc">${escapeHtml(rule.description)}</div>
            </div>
            <div class="rule-badges">
              ${rule.fixableCount > 0 ? `<span class="fixable-badge">🛠 ${rule.fixableCount} fixable</span>` : ''}
              <span class="count-badge">${rule.count}</span>
              ${rule.url ? `<span class="doc-link" data-url="${escapeHtml(rule.url)}">Docs ↗</span>` : ''}
            </div>
          </div>
          <div class="rule-body">
            ${rule.files.map(f => `
              <div class="file-group">
                <div class="file-header">
                  <span>📄 ${escapeHtml(f.relativePath)}</span>
                  <span style="font-size: 0.75rem; color: var(--vscode-descriptionForeground);">(${f.count})</span>
                </div>
                <ul class="occurrence-list">
                  ${f.occurrences.map(occ => `
                    <li class="occurrence-item"
                        data-filename="${encodeURIComponent(f.filename)}"
                        data-line="${occ.line}"
                        data-col="${occ.column}"
                        data-end-line="${occ.endLine}"
                        data-end-col="${occ.endColumn}">
                      <span class="occ-loc">Line ${occ.line}:${occ.column}</span>
                      <span class="occ-msg">${escapeHtml(occ.message)}</span>
                      ${occ.fixable ? `<span class="occ-fix">🛠 Auto-fixable</span>` : ''}
                    </li>
                  `).join('')}
                </ul>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `}

  <script>
    const vscode = acquireVsCodeApi();
    let activeFilter = 'all';

    function sendMsg(cmd) {
      vscode.postMessage({ command: cmd });
    }

    // Event Delegation: handles rule expand/collapse, file navigation, and doc links without inline onclick
    document.addEventListener('click', (e) => {
      // 1. Doc Link
      const docLink = e.target.closest('.doc-link');
      if (docLink && docLink.dataset.url) {
        e.stopPropagation();
        vscode.postMessage({
          command: 'openUrl',
          url: docLink.dataset.url
        });
        return;
      }

      // 2. Occurrence item (Click to open file in editor)
      const occItem = e.target.closest('.occurrence-item');
      if (occItem && occItem.dataset.filename) {
        vscode.postMessage({
          command: 'openLocation',
          filename: decodeURIComponent(occItem.dataset.filename),
          line: Number(occItem.dataset.line || 1),
          column: Number(occItem.dataset.col || 1),
          endLine: Number(occItem.dataset.endLine || occItem.dataset.line || 1),
          endColumn: Number(occItem.dataset.endCol || occItem.dataset.col || 1)
        });
        return;
      }

      // 3. Rule card accordion toggle
      const ruleHeader = e.target.closest('.rule-header');
      if (ruleHeader) {
        const card = ruleHeader.closest('.rule-card');
        if (card) {
          card.classList.toggle('expanded');
        }
        return;
      }

      // 4. Filter pill
      const pill = e.target.closest('.pill');
      if (pill && pill.dataset.filter) {
        activeFilter = pill.dataset.filter;
        document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        filterRules();
        return;
      }
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', filterRules);
    }

    function filterRules() {
      const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
      const cards = document.querySelectorAll('.rule-card');

      cards.forEach(card => {
        const searchAttr = card.getAttribute('data-search') || '';
        const matchesSearch = !query || searchAttr.includes(query);
        let matchesFilter = true;

        if (activeFilter === 'fixable') {
          matchesFilter = card.getAttribute('data-fixable') === 'true';
        } else if (activeFilter === 'error') {
          matchesFilter = card.getAttribute('data-severity') === 'error';
        } else if (activeFilter === 'warning') {
          matchesFilter = card.getAttribute('data-severity') === 'warning';
        }

        if (matchesSearch && matchesFilter) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
