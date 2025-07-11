import * as vscode from 'vscode';
import OpenAI from 'openai';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('grok-integration.askGrok', async () => {
    // Get API key from settings
    const config = vscode.workspace.getConfiguration('grok');
    const apiKey = config.get<string>('apiKey');
    if (!apiKey) {
      vscode.window.showErrorMessage('Please set your xAI API key in settings.');
      return;
    }

    // Get selected text from active editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor.');
      return;
    }
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection).trim();
    if (!selectedText) {
      vscode.window.showErrorMessage('No text selected.');
      return;
    }

    // Prompt user for question (or use a default)
    const userPrompt = await vscode.window.showInputBox({
      prompt: 'What do you want to ask Grok about this code?',
      value: 'Explain this code:'
    });
    if (!userPrompt) return;

    // Initialize OpenAI client with xAI base URL
    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1'
    });

    try {
      // Call Grok API (use 'grok-3-beta' or latest model)
      const response = await openai.chat.completions.create({
        model: 'grok-3-beta',  // Replace with desired model, e.g., 'grok-3-mini-beta'
        messages: [
          { role: 'system', content: 'You are a helpful coding assistant.' },
          { role: 'user', content: `${userPrompt}\n\n${selectedText}` }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      const grokResponse = response.choices[0]?.message?.content || 'No response received.';

      // Display response in a webview panel
      const panel = vscode.window.createWebviewPanel(
        'grokResponse',
        'Grok Response',
        vscode.ViewColumn.Beside,
        {}
      );
      panel.webview.html = `<h1>Grok's Response</h1><pre>${grokResponse}</pre>`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Error calling Grok API: ${errorMessage}`);
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}