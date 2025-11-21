# TODO List for Grok Integration in VSCode

## High Priority
- Implement API calls to Grok AI for code suggestions.
- Add authentication handling for Grok API keys.
- Integrate with VSCode's completion provider.

## Medium Priority
- Support for multiple programming languages in suggestions.
- Add configuration settings for user preferences.
- Implement error handling and logging.

## Low Priority
- Add unit tests for core functions.
- Optimize performance for large files.
- Document the extension usage

--- FILE: /home/nickd/projects/vscode-grok4/grok-integration/src/extension.ts ---

To add support for a pair programming mode, we can introduce a new command that triggers a conversation with specific instructions for acting as a pair programmer. This assumes your extension already integrates with an AI API (e.g., Grok). 

import * as vscode from 'vscode';

// ... existing code ...

export function activate(context: vscode.ExtensionContext) {
    // ... existing activations ...

    let pairProgrammerDisposable = vscode.commands.registerCommand('grok4.pairProgrammer', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const selection = editor.document.getText(editor.selection);
        const pairPrompt = `
You are a pair programmer collaborating with the user. 
- Review the provided code or context.
- Suggest improvements, fixes, or optimizations.
- Ask clarifying questions if needed.
- Provide code snippets in Markdown blocks.
- Keep responses concise and focused on the task.

User's code/context: ${selection || 'No selection; describe your task.'}
`;

        // Assuming you have a function to send prompts to the AI API, e.g., sendToGrokAPI(prompt)
        // Replace with your actual API integration logic
        const response = await sendToGrokAPI(pairPrompt);
        
        // Display the response, e.g., in a webview or output channel
        vscode.window.showInformationMessage(response); // Or use a more suitable display method
    });

    context.subscriptions.push(pairProgrammerDisposable);
}

// ... rest of the file ...