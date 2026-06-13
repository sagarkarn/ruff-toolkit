---
name: ruff-toolkit-fix
description: Use when fixing bugs, registering commands, or resolving configuration errors in the Ruff Toolkit VS Code extension.
metadata:
  category: technique
  triggers: ruff-toolkit, fixWorkspace, package.json, vscode command not defined
---

# Ruff Toolkit Fix

## When to Use
- Fixing registration errors in package.json and extension code.
- Resolving command definition discrepancies in the Ruff Toolkit VS Code extension.
- Adding and debugging commands or menus.

## How It Works
1. Ensure all commands registered via `vscode.commands.registerCommand` in `src/commands/*.ts` are also declared in the `"commands"` array in `package.json`.
2. Ensure command references in `"menus"` (like `commandPalette` or context menus) in `package.json` use the exact registered command ID.
3. Validate that activation events match the registered command patterns (e.g. `onCommand:ruffToolkit.*`).
4. Compile the extension via `npm run compile` to verify TypeScript builds successfully.
