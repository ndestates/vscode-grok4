import * as vscode from "vscode";

export type MessageType = "workspace" | "tab" | "function" | "selection";
export type GrokChoice = { message: { content: string } };
export type GrokChoices = GrokChoice[];
export type Context = {
  workspaceFolder?: vscode.WorkspaceFolder;
  apiKey: string;
  model: string;
  question: string;
};
