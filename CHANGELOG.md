# Changelog

All notable changes to the **Ruff Toolkit** extension will be documented in this file.

## [1.1.0] - 2026-09-26

### Added
- **Git Changed Files Commands**:
  - `Ruff: Check Changed Files` (`ruffToolkit.checkChangedFiles`)
  - `Ruff: Fix Changed Files` (`ruffToolkit.fixChangedFiles`)
  - `Ruff: Format Changed Files` (`ruffToolkit.formatChangedFiles`)
  - `Ruff: Check & Fix Changed Files` (`ruffToolkit.checkAndFixChangedFiles`)
- **Source Control (SCM) Integration**: Integrated a `Ruff` submenu in the Source Control view title bar for one-click access.
- **Git Service**: Intelligently identifies modified, staged, and untracked Python files (`.py`, `.pyi`) via VS Code Git API and CLI fallback, safely excluding deleted files.

## [1.0.0] - 2026-06-05


### Added
- **Submenus**: Integrated the Ruff submenu in the File Explorer right-click menu, Editor right-click context menu, and Editor Title bar.
- **Command Palette Integration**: Provided commands for Format File, Check File, Fix Issues, Check & Fix, Organize Imports, and Workspace-wide operations.
- **Ruff Validation**: Automatically runs `ruff --version` before commands to check path validity and alerts user with installation guidelines on failure.
- **Multi-File Progress UI**: Sequentially processes multiple selected files in the explorer, displaying a progress bar with cancellation support.
- **Auto-Refresh**: Leverages file-stat calls to automatically update editor contents after formatting/fixing.
- **Detailed Logs**: Creates a dedicated "Ruff Toolkit" output channel logging executed shell commands, exit codes, execution time, and stdout/stderr details.
- **Lint Check Summary Notifications**: Analyzes output logs to report specific violation counts (e.g. `⚠ Ruff check completed: found 3 issues.`) with a direct action button to open output logs.
- **Icons & Branding**: Created and configured a flat vector logo for the extension.
