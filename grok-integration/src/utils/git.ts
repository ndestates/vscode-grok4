import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export async function getGitLsFilesOutputAsArray(): Promise<vscode.Uri[]> {
  // Get workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  // Path to the workspace root
  const cwd = workspaceFolder!.uri.fsPath;

  // Run the git command
  const { stdout, stderr } = await execPromise(
    "git ls-files --cached --others --exclude-standard",
    { cwd }
  );

  if (stderr) {
    vscode.window.showErrorMessage(`Unable to read workspace git repository!`);
    throw new Error("No git repository");
  }

  // Split the output into an array, remove empty lines, and convert to vscode.Uri
  const filesArray = stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((relativePath) => vscode.Uri.file(`${cwd}/${relativePath}`));

  return filesArray;
}

export async function getOutputOfGitDiffStaged(): Promise<string> {
  // Get workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  // Path to the workspace root
  const cwd = workspaceFolder!.uri.fsPath;

  // Run the git command
  const { stdout, stderr } = await execPromise("git diff --staged", { cwd });

  if (stderr) {
    vscode.window.showErrorMessage(`Unable to read workspace git repository!`);
    throw new Error("No git repository");
  }

  return stdout;
}

export async function ammendGitCommitMessage(newMessage: string) {
  // Get workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  // Path to the workspace root
  const cwd = workspaceFolder!.uri.fsPath;

  // Run the git command
  const { stderr } = await execPromise(
    `git commit --amend -m "${newMessage}"`,
    { cwd }
  );

  if (stderr) {
    vscode.window.showErrorMessage(`Unable to read workspace git repository!`);
    throw new Error("No git repository");
  }
}
