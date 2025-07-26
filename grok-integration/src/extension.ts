import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';
import createDOMPurify from 'dompurify';
import { parseHTML } from 'linkedom';
import { tokenizeText } from './utils/tokenizer';
import { marked } from 'marked';


// Lightweight DOM setup for DOMPurify
const { window } = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
const purify = createDOMPurify(window as any);

// Rate limiting: Simple in-memory counter (reset every minute)
const MAX_REQUESTS_PER_MINUTE = 20;

// Use globalState for rate limiting to persist across reloads and windows
function getRequestCount(context: vscode.ExtensionContext): number {
  return context.globalState.get<number>('grokRequestCount', 0);
}

function setRequestCount(context: vscode.ExtensionContext, count: number) {
  context.globalState.update('grokRequestCount', count);
}

export async function activate(context: vscode.ExtensionContext) {
  try {
    // Add this timer to reset the request counter every 60 seconds
    const rateLimitInterval = setInterval(() => {
      setRequestCount(context, 0);
    }, 60000);
    context.subscriptions.push({
      dispose: () => {
        clearInterval(rateLimitInterval);
      }
    });

    // Warn if extension is reloaded (rate limit resets)
    if (getRequestCount(context) > 0) {
      vscode.window.showWarningMessage('Grok Integration extension was reloaded. Rate limit counter has been reset.');
    }

    // Helper functions
    function redactSecrets(text: string): string {
      return text.replace(/(api_key|password|secret|token|jwt|bearer|env)=[^& \n]+/gi, '$1=REDACTED');
    }

    async function estimateTokens(text: string, files: string[] = []): Promise<number> {
      let total = 0;
      try {
        total += await tokenizeText(text);

        for (const file of files) {
          const content = await fs.promises.readFile(file, 'utf-8');
          total += await tokenizeText(content);
        }
        return total;
      } catch {
        // Fallback heuristic (async version)
        try {
          const fileContents = await Promise.all(files.map(async f => {
            try {
              return await fs.promises.readFile(f, 'utf-8');
            } catch {
              return '';
            }
          }));
          const combined = [text, ...fileContents].join(' ');
          const cleaned = combined.trim().replace(/\s+/g, ' ');
          return Math.ceil((cleaned.length / 4) * 1.1);
        } catch {
          // If even async fails, just estimate from text
          const cleaned = text.trim().replace(/\s+/g, ' ');
          return Math.ceil((cleaned.length / 4) * 1.1);
        }
      }
    }

    async function getWorkspaceContext(): Promise<string> {
      const workspaceName = vscode.workspace.name || 'Untitled';
      const activeFile = vscode.window.activeTextEditor?.document.fileName || 'No active file';
      return `Workspace: ${workspaceName}\nActive File: ${activeFile}`;
    }

    function getLoadingHTML(): string {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              background: var(--vscode-editor-background);
              color: var(--vscode-editor-foreground);
              font-family: var(--vscode-font-family);
              font-size: 1rem;
              padding: 1em;
            }
            .action-bar {
              position: sticky;
              top: 0;
              background: var(--vscode-editor-background);
              padding-bottom: 10px;
              border-bottom: 1px solid var(--vscode-side-bar-border);
              margin-bottom: 10px;
            }
            .action-button {
              cursor: pointer;
              background: var(--vscode-button-background);
              color: var(--vscode-button-foreground);
              border: 1px solid var(--vscode-button-border);
              border-radius: 3px;
              padding: 4px 10px;
              font-size: 1rem;
              transition: background 0.2s, color 0.2s, border 0.2s;
            }
            .action-button:hover,
            .action-button:focus-visible {
              background: var(--vscode-button-hover-background);
              color: var(--vscode-button-foreground);
              outline: 2px solid var(--vscode-focus-border);
            }
            .action-button:focus {
              outline: 2px solid var(--vscode-focus-border);
            }
            .code-block-wrapper {
              position: relative;
              background-color: var(--vscode-editor-background);
              border: 1px solid var(--vscode-side-bar-border);
              border-radius: 4px;
              margin: 1em 0;
            }
            pre {
              padding: 1em;
              margin: 0;
              white-space: pre-wrap;
              word-wrap: break-word;
              font-size: 0.95rem;
              background: var(--vscode-editor-background);
              color: var(--vscode-editor-foreground);
            }
            code {
              font-family: var(--vscode-editor-font-family, monospace);
              font-size: 0.95rem;
            }
            .copy-button {
              position: absolute;
              top: 5px;
              right: 5px;
              cursor: pointer;
              background: var(--vscode-button-background);
              color: var(--vscode-button-foreground);
              border: 1px solid var(--vscode-button-border);
              border-radius: 3px;
              padding: 2px 6px;
              opacity: 0.8;
              transition: opacity 0.2s, background 0.2s, color 0.2s;
            }
            .copy-button:hover,
            .copy-button:focus-visible {
              opacity: 1;
              background: var(--vscode-button-hover-background);
              outline: 2px solid var(--vscode-focus-border);
            }
            .copy-button:focus {
              outline: 2px solid var(--vscode-focus-border);
            }
            @media (max-width: 600px) {
              body {
                font-size: 0.95rem;
              }
              .action-button, pre, code {
                font-size: 0.9rem;
              }
            }
          </style>
        </head>
        <body>
          <div class="action-bar">
            <button id="save-button" class="action-button" title="Save response as a Markdown file" aria-label="Save response as a Markdown file">💾 Save</button>
          </div>
          <div id="content">🔍 Connecting to Grok... Please wait.</div>
          <script>
            (function() {
              const vscode = acquireVsCodeApi();
              // Additional sanitization function for streamed content
              function escapeHtml(unsafe) {
                return unsafe
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;")
                  .replace(/'/g, "&#039;");
              }

              document.getElementById('save-button').addEventListener('click', () => {
                vscode.postMessage({ command: 'saveFile' });
              });

              function copyToClipboard(text) {
                // Try navigator.clipboard first
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(text).then(() => {
                    vscode.postMessage({ command: 'showInfo', message: 'Code copied to clipboard!' });
                  }, (err) => {
                    // Fallback to execCommand if clipboard API fails
                    fallbackCopy(text, err);
                  });
                } else {
                  fallbackCopy(text);
                }
              }

              function fallbackCopy(text, origError) {
                try {
                  const textarea = document.createElement('textarea');
                  textarea.value = text;
                  textarea.setAttribute('readonly', '');
                  textarea.style.position = 'absolute';
                  textarea.style.left = '-9999px';
                  document.body.appendChild(textarea);
                  textarea.select();
                  const successful = document.execCommand('copy');
                  document.body.removeChild(textarea);
                  if (successful) {
                    vscode.postMessage({ command: 'showInfo', message: 'Code copied to clipboard!' });
                  } else {
                    vscode.postMessage({ command: 'showError', message: 'Failed to copy code.' });
                  }
                } catch (e) {
                  let msg = 'Failed to copy code.';
                  if (origError) msg += ' Clipboard API error: ' + origError;
                  vscode.postMessage({ command: 'showError', message: msg });
                }
              }

              function setupCopyButtons() {
                const codeBlocks = document.querySelectorAll('pre code');
                codeBlocks.forEach((codeBlock, index) => {
                  let wrapper = codeBlock.parentNode;
                  if (!wrapper.classList.contains('code-block-wrapper')) {
                    wrapper = document.createElement('div');
                    wrapper.className = 'code-block-wrapper';
                    codeBlock.parentNode.insertBefore(wrapper, codeBlock);
                    wrapper.appendChild(codeBlock);
                  }

                  // Remove old copy button if it exists
                  const oldButton = wrapper.querySelector('.copy-button');
                  if (oldButton) {
                    oldButton.remove();
                  }

                  // Create new copy button
                  const copyButton = document.createElement('div');
                  copyButton.className = 'copy-button';
                  copyButton.innerHTML = '📋';
                  copyButton.title = 'Copy code to clipboard';
                  copyButton.setAttribute('tabindex', '0');
                  copyButton.setAttribute('role', 'button');
                  copyButton.setAttribute('aria-label', 'Copy code to clipboard');
                  // Mouse click
                  copyButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const code = codeBlock.innerText;
                    copyToClipboard(code);
                  });
                  // Keyboard accessibility
                  copyButton.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      const code = codeBlock.innerText;
                      copyToClipboard(code);
                    }
                  });
                  wrapper.appendChild(copyButton);
                });
              }

              window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'update') {
                  // Sanitize streamed content before rendering
                  const sanitizedContent = escapeHtml(message.content);
                  document.getElementById('content').innerHTML += sanitizedContent;
                  setupCopyButtons(); // Setup copy buttons for new content
                } else if (message.type === 'complete') {
                  document.getElementById('content').innerHTML = message.html;
                  setupCopyButtons(); // Setup copy buttons for final content
                } else if (message.command === 'showInfo') {
                  vscode.postMessage({ command: 'showInfo', message: message.message });
                } else if (message.command === 'showError') {
                  vscode.postMessage({ command: 'showError', message: message.message });
                }
              });
            })();
          </script>
        </body>
        </html>
      `;
    }

    function convertMarkdownToHtml(markdown: string): string {
      // Use marked for markdown parsing, then sanitize
      const html = marked.parse(markdown, { breaks: true });
      return purify.sanitize(typeof html === 'string' ? html : '');
    }

    // API functions
    async function testGrokConnection(apiKey: string): Promise<boolean> {
      try {
        const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 30000 });
        const response = await openai.chat.completions.create({
          model: 'grok-4-0709',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 3,
          temperature: 0.1
        });
        return response.choices && response.choices.length > 0;
      } catch (error) {
        return false;
      }
    }

    async function showGrokPanel(context: vscode.ExtensionContext, title: string, code: string, language: string, action: string): Promise<void> {
      let currentCount = getRequestCount(context);
      if (currentCount >= MAX_REQUESTS_PER_MINUTE) {
        vscode.window.showErrorMessage('Rate limit exceeded. Please wait a minute.');
        return;
      }
      setRequestCount(context, currentCount + 1);

      const config = vscode.workspace.getConfiguration('grokIntegration');
      let apiKey = config.get<string>('apiKey');
      // Robust API key check
      if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
        const newKey = await vscode.window.showInputBox({
          prompt: 'Enter your xAI API key',
          password: true,
          placeHolder: 'xai-...'
        });
        if (newKey && typeof newKey === 'string' && newKey.trim()) {
          await config.update('apiKey', newKey.trim(), vscode.ConfigurationTarget.Global);
          apiKey = newKey.trim();
        } else {
          vscode.window.showErrorMessage('❌ API key is required to use Grok Integration.');
          return;
        }
      }
      const panel = vscode.window.createWebviewPanel('grokResponse', title, vscode.ViewColumn.Beside, { enableScripts: true });
      panel.webview.html = getLoadingHTML();

      const rawMarkdownResponse = await processGrokRequest(panel, code, language, action, apiKey);

      panel.webview.onDidReceiveMessage(
        async message => {
          if (message.command === 'saveFile') {
            if (rawMarkdownResponse) {
              const now = new Date();
              const day = String(now.getDate()).padStart(2, '0');
              const month = String(now.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
              const year = now.getFullYear();
              const hours = String(now.getHours()).padStart(2, '0');
              const minutes = String(now.getMinutes()).padStart(2, '0');
              const seconds = String(now.getSeconds()).padStart(2, '0');
              const timestamp = `${day}${month}${year}-${hours}${minutes}${seconds}`;
              const filename = `${timestamp}-grok-response.md`;

              const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(filename),
                filters: { 'Markdown Files': ['md'] }
              });
              if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(rawMarkdownResponse, 'utf8'));
                vscode.window.showInformationMessage(`✅ Response saved to ${path.basename(uri.fsPath)}`);
              }
            } else {
              vscode.window.showErrorMessage('No response content to save.');
            }
          }
        },
        undefined,
        context.subscriptions
      );
    }

    async function processGrokRequest(panel: vscode.WebviewPanel, code: string, language: string, action: string, apiKey: string): Promise<string | undefined> {
      try {
        // Defensive API key check
        if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
          panel.webview.postMessage({ type: 'complete', html: '<p>❌ Error: API key is missing or invalid. Please set your xAI API key in settings.</p>' });
          return '# Error\n\nAPI key is missing or invalid.';
        }
        const openai = new OpenAI({ apiKey: apiKey.trim(), baseURL: 'https://api.x.ai/v1', timeout: 60000 });
        const redactedCode = redactSecrets(code);
        const prompt = `As Grok, ${action} this ${language} code:\n\n${redactedCode}`;
        const tokenCount = await estimateTokens(prompt);
        if (tokenCount > 8000) {
          panel.webview.postMessage({ type: 'complete', html: '<p>⚠️ Prompt too long (estimated ' + tokenCount + ' tokens). Shorten your selection.</p>' });
          return;
        }
        const config = vscode.workspace.getConfiguration('grokIntegration');
        const maxTokens = config.get<number>('maxTokens') || 9000;
        const stream = await openai.chat.completions.create({
          model: 'grok-4-0709',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.5,
          stream: true,
        });
        let fullResponse = '';
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            panel.webview.postMessage({ type: 'update', content: purify.sanitize(content.replace(/\n/g, '<br>')) });
          }
        }
        panel.webview.postMessage({ type: 'complete', html: convertMarkdownToHtml(fullResponse) });
        return fullResponse; // Return the raw markdown content
      } catch (error) {
        let errorMsg = 'Unknown error';
        // Never log API key
        if (error instanceof Error) {
          errorMsg = error.message;
          if (error.stack) {
            console.error('processGrokRequest error stack:', error.stack);
          } else {
            console.error('processGrokRequest error:', error);
          }
        } else {
          try {
            errorMsg = JSON.stringify(error);
          } catch {
            errorMsg = String(error);
          }
          console.error('processGrokRequest non-Error:', error);
        }
        panel.webview.postMessage({ type: 'complete', html: '<p>❌ Error: ' + errorMsg + '</p>' });
        return `# Error\n\n${errorMsg}`; // Return error as markdown
      }
    }

    // Chat participant
    // REFACTORED: Simplified to a handler object for the modern Chat API.
    const chatHandler = {
      async handleRequest(request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<vscode.ChatResult> {
        const config = vscode.workspace.getConfiguration('grokIntegration');
        const apiKey = config.get<string>('apiKey');
        // Robust API key check
        if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
          stream.markdown('❌ **API Key Required**: Please set your xAI API key in settings.\n\n[Open Settings](command:workbench.action.openSettings?%5B%22grokIntegration.apiKey%22%5D)');
          return {}; // CORRECTED: Must return a ChatResult object
        }
        const openai = new OpenAI({ apiKey: apiKey.trim(), baseURL: 'https://api.x.ai/v1', timeout: 60000 });
        let action = 'respond to';
        if (request.command === 'explain') action = 'explain';
        else if (request.command === 'review') action = 'review and suggest improvements for';
        else if (request.command === 'debug') action = 'debug';

        stream.markdown(`🔍 **Processing request**: ${action} the provided context...`);
        let fullContext = '';


        if (request.references && request.references.length > 0) {
          const fileUris: vscode.Uri[] = [];
          for (const ref of request.references) {
            if (ref.value instanceof vscode.Uri) {
              fileUris.push(ref.value);
            }
          }

          if (fileUris.length > 0) {
            try {
              // Extract file names and format as a bulleted Markdown list for better readability
              const fileNamesList = fileUris
                .map(uri => `- ${path.basename(uri.fsPath)}`) // Fixed syntax: proper template literal for bullet
                .join('\n');

              // Handle singular/plural for UX polish
              const fileCount = fileUris.length;
              const fileWord = fileCount === 1 ? 'file' : 'files';

              // Constants for buttons and messages (easier to maintain/localize)
              const YES_BUTTON = 'Yes, Send Content';
              const NO_BUTTON = 'No, Cancel';
              const PRIVACY_NOTE = '\n\nNote: File contents will be sent securely to the xAI API for processing. See our privacy policy for details.';

              // Use showWarningMessage for emphasis on data sharing
              const consent = await vscode.window.showWarningMessage(
                `Do you consent to sending the content of the following ${fileWord} to the xAI API?${PRIVACY_NOTE}\n\n${fileNamesList}`,
                { modal: true },
                YES_BUTTON,
                NO_BUTTON
              );

              // Optional: Handle the response explicitly (e.g., proceed or abort)
              if (consent === YES_BUTTON) {
                // Proceed with sending (not shown here)
                vscode.window.showInformationMessage(`Sending ${fileCount} ${fileWord} to xAI... Buckle up!`);
              } else if (consent === NO_BUTTON) {
                vscode.window.showInformationMessage('Operation cancelled. Your files are safe with you.');
                return {}; // Or throw/return early
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              vscode.window.showErrorMessage(`Error preparing file consent: ${errorMsg}`);
              // Optional: Log to console or telemetry
              console.error('File consent error:', error);
              stream.markdown('An error occurred while preparing the consent prompt. Request aborted.');
              return {};
            }


            for (const uri of fileUris) {
              try {
                const contentBytes = await vscode.workspace.fs.readFile(uri);
                const content = Buffer.from(contentBytes).toString('utf8');
                const relativePath = vscode.workspace.asRelativePath(uri);
                fullContext += `\n\n--- FILE: ${relativePath} ---\n${content}\n--- END FILE ---`;
              } catch (e) {
                console.error(`Failed to read file context for URI: ${uri.toString()}`, e);
                stream.markdown(`⚠️ Could not read file: ${vscode.workspace.asRelativePath(uri)}`);
              }
            }
          }
        }

        // 2. Get context from the active editor's selection (if any)
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const selectionCode = editor.document.getText(editor.selection);
          if (selectionCode) {
            const language = editor.document.languageId;
            fullContext += `\n\n--- ACTIVE SELECTION (${language}) ---\n${selectionCode}\n--- END SELECTION ---`;
          }
        }


        const redactedContext = redactSecrets(fullContext);
        const workspaceInfo = await getWorkspaceContext();
        const userPrompt = request.prompt || 'Hello';

        const systemMessage = 'You are a direct and professional AI programming assistant. Provide accurate, concise answers without any witty remarks or conversational filler. The user has provided context from one or more files. When suggesting changes, clearly state which file each change belongs to using a markdown file block header (e.g., `--- FILE: path/to/file.ts ---`). All code suggestions must be enclosed in a language-specific Markdown code block. For example:\n\`\`\`typescript\n// your typescript code here\n\`\`\`';
        const userMessage = `Task: ${action} the following. User prompt: "${userPrompt}"\n\nHere is the full context from the user's workspace:${redactedContext}\n\nWorkspace Info: ${workspaceInfo}`;

        const maxTokens = config.get<number>('maxTokens') || 9000;
        const tokenCount = await estimateTokens(systemMessage + userMessage);

        if (tokenCount > maxTokens) {
          const choice = await vscode.window.showWarningMessage(
            `The request size is approximately ${tokenCount} tokens, which exceeds your configured limit of ${maxTokens}. Large requests may be slow, costly, or fail.`,
            { modal: true },
            'Proceed Anyway'
          );

          if (choice !== 'Proceed Anyway') {
            stream.markdown('Request cancelled due to large token size.');
            return {}; // CORRECTED: Must return a ChatResult object
          }
        }

        try {
          stream.progress('🔍 Connecting to Grok...');
          const response = await openai.chat.completions.create({
            model: 'grok-4-0709',
            messages: [
              { role: 'system', content: systemMessage },
              { role: 'user', content: userMessage }
            ],
            max_tokens: maxTokens,
            temperature: 0.2,
            stream: true,
          });
          let hasContent = false;
          for await (const chunk of response) {
            if (token.isCancellationRequested) {
              return {}; // CORRECTED: Must return a ChatResult object
            }
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              if (!hasContent) {
                stream.progress('📝 Receiving response...');
                hasContent = true;
              }
              stream.markdown(content);
            }
          }
          if (!hasContent) {
            stream.markdown('⚠️ No response received from Grok. Please try again.');
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          stream.markdown(`❌ **Error**: ${errorMsg}\n\nPlease check your API key and try again.`);
        }

        return {}; // CORRECTED: Must return a ChatResult object at the end
      }
    };

    // Commands
    async function askGrokCommand(context: vscode.ExtensionContext): Promise<void> {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const code = editor.document.getText(editor.selection);
      const language = editor.document.languageId;
      await showGrokPanel(context, 'Grok Response', code, language, 'analyze');
    }

    async function explainCodeCommand(context: vscode.ExtensionContext): Promise<void> {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
      }
      const code = editor.document.getText(editor.selection);
      const language = editor.document.languageId;
      if (!code.trim()) {
        vscode.window.showErrorMessage('Please select code to explain.');
        return;
      }
      await showGrokPanel(context, 'Grok Explanation', code, language, 'explain');
    }

    async function reviewCodeCommand(context: vscode.ExtensionContext): Promise<void> {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const code = editor.document.getText(editor.selection);
      const language = editor.document.languageId;
      await showGrokPanel(context, 'Grok Review', code, language, 'review and suggest improvements for');
    }

    async function suggestImprovementsCommand(context: vscode.ExtensionContext): Promise<void> {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const code = editor.document.getText(editor.selection);
      const language = editor.document.languageId;
      await showGrokPanel(context, 'Grok Suggestions', code, language, 'suggest improvements for');
    }

    async function askGrokInlineCommand(): Promise<void> {
      const config = vscode.workspace.getConfiguration('grokIntegration');
      const apiKey = config.get<string>('apiKey');
      if (!apiKey) {
        const action = await vscode.window.showErrorMessage('🔑 xAI API Key Required', 'Open Settings', 'Get API Key');
        if (action === 'Open Settings') vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
        else if (action === 'Get API Key') vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/'));
        return;
      }
      await vscode.commands.executeCommand('workbench.action.chat.open');
      await vscode.commands.executeCommand('workbench.action.chat.insertAtCursor', '@grok ');
    }

    async function editWithGrokCommand(): Promise<void> {
      const config = vscode.workspace.getConfiguration('grokIntegration');
      const apiKey = config.get<string>('apiKey');
      if (!apiKey) {
        const action = await vscode.window.showErrorMessage('🔑 xAI API Key Required', 'Open Settings', 'Get API Key');
        if (action === 'Open Settings') vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
        else if (action === 'Get API Key') vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/'));
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor.');
        return;
      }
      const selection = editor.selection;
      const selectedText = editor.document.getText(selection).trim();
      if (!selectedText && selection.isEmpty) {
        await vscode.commands.executeCommand('inlineChat.start');
        return;
      }
      await vscode.commands.executeCommand('workbench.action.chat.open');
      const prompt = `@grok Please help me edit this ${editor.document.languageId} code:\n\n\`\`\`${editor.document.languageId}\n${selectedText}\n\`\`\`\n\nWhat would you like me to do with this code?`;
      await vscode.commands.executeCommand('workbench.action.chat.insertAtCursor', prompt);
    }

    async function debugTestCommand(): Promise<void> {
      vscode.window.showInformationMessage('Debug test successful');
    }

    const testConnectionCommand = vscode.commands.registerCommand('grok-integration.testConnection', async () => {
      const config = vscode.workspace.getConfiguration('grokIntegration');
      const apiKey = config.get<string>('apiKey');
      if (!apiKey) {
        const action = await vscode.window.showErrorMessage('🔑 API Key Required', 'Open Settings', 'Get API Key');
        if (action === 'Open Settings') vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
        else if (action === 'Get API Key') vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/'));
        return;
      }
      vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Testing Grok API Connection...", cancellable: false }, async (progress) => {
        progress.report({ increment: 20, message: "Connecting..." });
        const success = await testGrokConnection(apiKey);
        progress.report({ increment: 80, message: "Verifying response..." });
        if (success) {
          vscode.window.showInformationMessage('✅ Grok API Connection Successful! Ready to use @grok in chat.');
        } else {
          const action = await vscode.window.showErrorMessage('❌ Connection Failed: Please check your API key', 'Check API Key', 'Get Help');
          if (action === 'Check API Key') vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
          else if (action === 'Get Help') vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/docs'));
        }
      });
    });

    async function uploadFilesCommand(): Promise<void> {
      // 1. Select files using the VS Code dialog
      const files = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFolders: false,
        title: 'Select files to discuss with Grok'
      });
      if (!files || files.length === 0) {
        return; // User cancelled the dialog
      }

      // 2. Ask for explicit user consent before reading any file content
      const fileNames = files.map(file => path.basename(file.fsPath)).join(', ');
      const consent = await vscode.window.showInformationMessage(
        `Do you want to send the content of ${files.length} file(s) (${fileNames}) as context to Grok?`,
        { modal: true },
        'Yes, Continue to Chat'
      );

      if (consent !== 'Yes, Continue to Chat') {
        vscode.window.showInformationMessage('Request cancelled. Consent to send file content was not given.');
        return;
      }

      // 3. Open the chat panel and pre-fill it with the selected file contexts
      await vscode.commands.executeCommand('workbench.action.chat.open');

      // Build the file context string for the chat input
      const fileContextString = files.map(file => `#file:${file.fsPath}`).join(' ');

      // Insert the context and a prompt into the chat input
      await vscode.commands.executeCommand('workbench.action.chat.insertAtCursor', `@grok ${fileContextString} \n\nPlease analyze these files.`);
    }

    async function showTokenCountCommand(): Promise<void> {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const text = editor.document.getText(editor.selection);
      const tokenCount = await estimateTokens(text);
      vscode.window.showInformationMessage(`Estimated tokens: ${tokenCount}`);
    }

    async function securityFixCommand(context: vscode.ExtensionContext): Promise<void> {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor. Please select code to analyze.');
        return;
      }
      const code = editor.document.getText(editor.selection);
      if (!code) {
        vscode.window.showErrorMessage('No code selected. Please select code to analyze.');
        return;
      }
      const language = editor.document.languageId;
      const config = vscode.workspace.getConfiguration('grokIntegration');
      const apiKey = config.get<string>('apiKey');
      if (!apiKey) {
        vscode.window.showErrorMessage('Please set your xAI API key in settings.');
        return;
      }
      const panel = vscode.window.createWebviewPanel('grokSecurityFix', 'Grok Security Fix', vscode.ViewColumn.Beside, { enableScripts: true });
      panel.webview.html = getLoadingHTML();
      await processGrokRequest(panel, code, language, 'find and suggest security fixes for', apiKey);
    }

    // Register chat participant
    // CORRECTED: Pass the function directly, not an object
    const participant = vscode.chat.createChatParticipant('grok-integration.grok', chatHandler.handleRequest.bind(chatHandler));
    participant.iconPath = new vscode.ThemeIcon('hubot');
    participant.followupProvider = {
      provideFollowups(result: vscode.ChatResult, context: vscode.ChatContext, token: vscode.CancellationToken) {
        return [{ prompt: 'Explain this in more detail', label: '🔍 More details', command: 'explain' }, { prompt: 'Show me an example', label: '💡 Show example' }, { prompt: 'How can I improve this code?', label: '⚡ Improve code', command: 'review' }];
      }
    };
    context.subscriptions.push(participant);

    // Register commands
    const commands = [
      vscode.commands.registerCommand('grok-integration.askGrok', () => askGrokCommand(context)),
      vscode.commands.registerCommand('grok-integration.explainCode', () => explainCodeCommand(context)),
      vscode.commands.registerCommand('grok-integration.reviewCode', () => reviewCodeCommand(context)),
      vscode.commands.registerCommand('grok-integration.suggestImprovements', () => suggestImprovementsCommand(context)),
      vscode.commands.registerCommand('grok-integration.askGrokInline', () => askGrokInlineCommand()),
      vscode.commands.registerCommand('grok-integration.editWithGrok', () => editWithGrokCommand()),
      vscode.commands.registerCommand('grok-integration.uploadFiles', () => uploadFilesCommand()),
      vscode.commands.registerCommand('grok-integration.showTokenCount', () => showTokenCountCommand()),
      testConnectionCommand,
      vscode.commands.registerCommand('grok-integration.securityFix', () => securityFixCommand(context))
    ];
    context.subscriptions.push(...commands);

    // Register context menu items
    context.subscriptions.push(
      vscode.commands.registerCommand('grok-integration.explainCodeContext', () => explainCodeCommand(context)),
      vscode.commands.registerCommand('grok-integration.reviewCodeContext', () => reviewCodeCommand(context))
    );

    // Show success message
    vscode.window.showInformationMessage('🤖 Grok Integration activated! Try @grok in chat or right-click selected code.');

  } catch (error) {
    console.error('❌ Extension activation failed:', error);
    vscode.window.showErrorMessage(`Failed to activate Grok Integration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function deactivate() {
  console.log('🛑 Grok Integration extension deactivating...');
}
