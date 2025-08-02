import * as vscode from "vscode";
import { getApiKey, getModel, setApiKey } from "./config";
import { promptForApiKey, promptForQuestion } from "./ui";
import { Context } from "./types";

export async function ensureWorkspaceOpen(): Promise<vscode.WorkspaceFolder> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder open!");
    throw new Error("No workspace");
  }
  return workspaceFolder;
}

export async function ensureApiKey(): Promise<string> {
  let apiKey = await getApiKey();
  if (!apiKey) {
    apiKey = await promptForApiKey();
    if (apiKey) {
      await setApiKey(apiKey);
    } else {
      vscode.window.showErrorMessage("API Key is required!");
      throw new Error("No API key");
    }
  }
  return apiKey;
}

export async function ensureQuestion(): Promise<string> {
  const question = await promptForQuestion();
  if (!question) {
    vscode.window.showErrorMessage("A question is required!");
    throw new Error("No question");
  }
  return question;
}

export async function ensureModel(): Promise<string> {
  const model = await getModel();
  if (!model) {
    vscode.window.showErrorMessage("xAI model is required!");
    throw new Error("No model");
  }
  return model;
}

export async function prepareWorkspaceContext(): Promise<Context> {
  const workspaceFolder = await ensureWorkspaceOpen();
  return {
    workspaceFolder,
    ...await prepareContext(),
  };
}

export async function prepareContext(): Promise<Context> {
  const apiKey = await ensureApiKey();
  const model = await ensureModel();
  const question = await ensureQuestion();
  return { apiKey, model, question };
}
