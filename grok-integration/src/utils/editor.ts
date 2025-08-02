import * as vscode from "vscode";
import * as path from "path";

import { VALID_EXTENSIONS } from "./valid-extensions";
import { EXCLUDE_LIST } from "./exclude-list";
import { getGitLsFilesOutputAsArray } from "./git";

export function isValidExtension(uri: vscode.Uri): boolean {
  const filename = path.basename(uri.path);
  if (!filename) {
    return false; // Empty filename is invalid
  }

  // Special cases: no extension or dot files
  if (!filename.includes(".")) {
    return true; // e.g., "README"
  }
  if (filename.startsWith(".")) {
    return true; // e.g., ".gitignore"
  }

  // Extract extension
  const extension = path.extname(filename).toLowerCase();
  if (!extension) {
    return false;
  }

  return VALID_EXTENSIONS.has(extension);
}

function notOnExcludeList(uri: vscode.Uri): boolean {
  const filename = path.basename(uri.path);
  if (!filename) {
    return false;
  }

  return !EXCLUDE_LIST.has(filename);
}

export async function readFileAsUtf8(uri: vscode.Uri) {
  const fileContent = await vscode.workspace.fs.readFile(uri);

  // Convert Uint8Array to string with UTF-8 encoding
  return new TextDecoder("utf-8").decode(fileContent);
}

export async function getFilesList() {
  const gitFiles = await getGitLsFilesOutputAsArray();
  return gitFiles.filter(isValidExtension).filter(notOnExcludeList);
}

export function getActiveTab() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active tab found!");
    throw new Error("No editor");
  }
  const path = editor.document.uri.path;
  const content = editor.document.getText();
  if (!content) {
    vscode.window.showErrorMessage("Active tab appears to be empty!");
    throw new Error("Empty tab");
  }
  return { path, content };
}

export async function getActiveFunctionText(): Promise<string> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active tab found!");
    throw new Error("No editor");
  }
  const document = editor.document;
  const position = editor.selection.active;
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    document.uri
  );
  if (!symbols || symbols.length === 0) {
    vscode.window.showErrorMessage("No symbols found!");
    throw new Error("No symbols");
  }
  const activeFunction = findContainingFunction(symbols, position);
  if (!activeFunction) {
    vscode.window.showErrorMessage("Unable to determine function!");
    throw new Error("No function");
  }
  return document.getText(activeFunction.range);
}

export function findContainingFunction(
  symbols: vscode.DocumentSymbol[],
  position: vscode.Position
): vscode.DocumentSymbol | undefined {
  for (const symbol of symbols) {
    if (
      symbol.kind === vscode.SymbolKind.Function ||
      symbol.kind === vscode.SymbolKind.Method
    ) {
      if (symbol.range.contains(position)) {
        return symbol;
      }
    }
    if (symbol.children?.length) {
      const childResult = findContainingFunction(symbol.children, position);
      if (childResult) {
        return childResult;
      }
    }
  }
}

export async function getSelectedText() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active tab found!");
    throw new Error("No editor");
  }

  const selection = editor.selection;
  if (!selection) {
    vscode.window.showErrorMessage("No selection available!");
    throw new Error("No selection");
  }

  const selectedText = editor.document.getText(selection);
  if (!selectedText) {
    vscode.window.showErrorMessage("No selected text found!");
    throw new Error("No selected text");
  }

  return selectedText;
}
