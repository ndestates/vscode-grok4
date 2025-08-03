import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";

const execAsync = promisify(exec);

export async function getGitLsFilesOutputAsArray(): Promise<vscode.Uri[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    // Fallback to workspace.findFiles if no git
    return await vscode.workspace.findFiles("**/*", "**/node_modules/**");
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  try {
    const { stdout } = await execAsync("git ls-files", { cwd: workspaceRoot });
    const files = stdout.trim().split("\n").filter((file) => file.length > 0);
    return files.map((file) => vscode.Uri.file(path.join(workspaceRoot, file)));
  } catch (error) {
    // Fallback to workspace.findFiles if git command fails
    console.log("Git not available, using workspace.findFiles fallback");
    return await vscode.workspace.findFiles("**/*", "**/node_modules/**");
  }
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
async function execPromise(command: string, options: { cwd: string }): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, options);
    return { stdout, stderr };
  } catch (error: any) {
    return { stdout: "", stderr: error?.message || "Unknown error" };
  }
}

