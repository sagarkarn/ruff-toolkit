# Ruff Toolkit

**Ruff Toolkit** is a production-ready VS Code extension that integrates the extremely fast Python linter and formatter **Ruff** directly into your VS Code context menus and Command Palette.

Run formatting, lint checks, automatic issue fixes, or organize imports directly on your Python files or entire workspaces with a single click.

---

## Features

### 1. Explorer Context Menu
Right-click any `.py` file or a multi-selection of files in the File Explorer to invoke the Ruff submenu:
* **Format File(s)**: Runs `ruff format <file>`
* **Check File(s)**: Runs `ruff check <file>`
* **Fix Issues**: Runs `ruff check --fix <file>`
* **Check & Fix**: Runs `ruff check --fix <file>` and then `ruff format <file>`
* **Organize Imports**: Runs `ruff check --select I --fix <file>`

### 2. Editor Context Menu & Title Bar
When you have a Python file open, you can run the same Ruff actions by:
* Right-clicking inside the editor to open the context menu.
* Clicking the **Ruff** icon/submenu in the editor title bar (top right).

### 3. Multi-File Selection Support
If you select multiple Python files in the File Explorer, Ruff Toolkit executes the action sequentially and shows a native VS Code progress bar:
`Ruff: Processing X files...`
You can cancel the operation at any time using the cancellation button on the progress notification.

### 4. Workspace Level Actions
Run operations across your entire workspace. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:
* `Ruff: Format Workspace` -> Runs `ruff format .`
* `Ruff: Check Workspace` -> Runs `ruff check .`
* `Ruff: Fix Workspace` -> Runs `ruff check --fix .`

These run directly inside the workspace folders. (Supports multi-folder workspaces too).

---

## Extension Settings

Configure the extension in your `settings.json`:

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ruffToolkit.ruffPath` | `string` | `"ruff"` | The executable path for Ruff. If it is in your system PATH, leave as `"ruff"`. Otherwise, specify the absolute path. |
| `ruffToolkit.showNotifications` | `boolean` | `true` | Show status toasts (e.g. `✓ Ruff format completed`) on successful execution. |
| `ruffToolkit.autoRefresh` | `boolean` | `true` | Automatically reload/refresh document content in the editor after formatting or fixing changes. |

---

## Output Channel Logging
All executions are logged to the output channel named **Ruff Toolkit**. Go to the `Output` pane in VS Code and select `Ruff Toolkit` from the dropdown. It logs:
* The executed command line.
* The execution status (`[SUCCESS]` or `[ERROR]`).
* Command standard output and error messages.
* High-resolution elapsed execution duration in milliseconds.

If a lint check finds issues or if a command fails, a toast notification is displayed with a **Show Output** button. Clicking it immediately focuses the output log.

---