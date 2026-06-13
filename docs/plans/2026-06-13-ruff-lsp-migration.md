# Ruff LSP Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the extension from using manual CLI sub-processes for real-time diagnostics, formatting, and quick fixes to using the official built-in `ruff server` LSP client.

**Architecture:** We will install the official `vscode-languageclient` package and initialize a background `LanguageClient` process in `src/extension.ts`. This client will launch the `ruff` binary with the `server` argument. Real-time diagnostics, native document formatting, and code actions (Quick Fixes) will be handled directly by the language server.

**Tech Stack:** TypeScript, VS Code Extension API (`vscode`), Language Server Protocol (`vscode-languageclient/node`).

---

### Task 1: Install `vscode-languageclient` Dependency

**Files:**
- Modify: `package.json`

**Step 1: Add dependency to package.json**
Add `"vscode-languageclient": "^9.0.1"` to the `"dependencies"` section of `package.json`.

**Step 2: Run npm install**
Run `npm install` to download dependencies and update `package-lock.json`.
Expected: `package-lock.json` updates and `node_modules/vscode-languageclient` is created.

**Step 3: Compile verification**
Run: `npm run compile`
Expected: Compile succeeds.

---

### Task 2: Implement Language Client Bootstrap in `src/extension.ts`

**Files:**
- Modify: `src/extension.ts`

**Step 1: Add imports and client state**
Import `LanguageClient`, `LanguageClientOptions`, and `ServerOptions` from `vscode-languageclient/node`. Declare a module-level variable `let client: LanguageClient | undefined;`.

**Step 2: Initialize and Start Client in `activate`**
Instantiate the `LanguageClient` with `serverOptions` (running `ruff` with the `server` argument) and `clientOptions` (Python document selector).
Call `client.start()`.

**Step 3: Stop Client in `deactivate`**
If `client` is active, return `client.stop()` to ensure clean teardown.

**Step 4: Compile verification**
Run: `npm run compile`
Expected: Compile succeeds.

---

### Task 3: Enhance Virtual Environment Executable Detection

**Files:**
- Modify: `src/services/ruffService.ts`

**Step 1: Implement interpreter path resolver**
Implement a method in `RuffService` to detect virtual environment paths (like `.venv/bin/ruff` or `.venv/Scripts/ruff.exe`) relative to the workspace folders, falling back to the settings-configured `ruffPath`.

**Step 2: Use resolved executable path for both LSP and manual commands**
Update `ruffService.getSettings()` or executable path resolution to use the resolved interpreter path.

**Step 3: Compile verification**
Run: `npm run compile`
Expected: Compile succeeds.

---

### Task 4: Align Existing Commands with the LSP

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/services/ruffService.ts`

**Step 1: Clean up manual event listeners**
Since the LSP handles diagnostics and real-time formatting, verify that the manual diagnostic collection and duplicate listeners are disabled or aligned.

**Step 2: Compile & Lint verification**
Run: `npm run lint` and `npm run compile`
Expected: Clear of lints and compiles successfully.
