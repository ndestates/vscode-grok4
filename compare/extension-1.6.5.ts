import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';
import createDOMPurify from 'dompurify';
import { parseHTML } from 'linkedom';
import { marked } from 'marked';
import * as os from 'os';

// Lightweight DOM setup for DOMPurify
const { window } = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
const purify = createDOMPurify(window as any);

// Rate limiting constants
const RATE_LIMIT_KEY = 'grokRateLimit';
const MAX_REQUESTS_PER_MINUTE = 20;

// Utility Functions
function redactSecrets(text: string): string {
  // Enhanced regex to cover more secret patterns (e.g., JSON keys, base64-like strings)
  return text.replace(/(api_key|password|secret|token|jwt|bearer|env|"apiKey"|"token"|"secret")[:=][^& \n"]+|(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/gi, '$1=REDACTED');
}

function convertMarkdownToHtml(markdown: string): string {
  const html = marked.parse(markdown, { breaks: true });
  return purify.sanitize(typeof html === 'string' ? html : '');
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
          background: #013D79; /* nd-dark-blue.500 */
          padding: 14px 10px 14px 10px;
          border-bottom: 2px solid #0270DE; /* nd-dark-blue.400 */
          margin-bottom: 18px;
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .action-button, .action-select {
          cursor: pointer;
          border-radius: 5px;
          font-size: 1rem;
          font-family: inherit;
          border: 1px solid #0270DE;
          margin-right: 4px;
          transition: background 0.2s, color 0.2s, border 0.2s;
        }
        .action-button#save-button {
          background: #4EB3D1; /* nd-light-blue.500 */
          color: #113742; /* nd-light-blue.900 */
          border-color: #319CBB; /* nd-light-blue.600 */
          font-weight: bold;
        }
        .action-button#save-button:hover, .action-button#save-button:focus-visible {
          background: #319CBB; /* nd-light-blue.600 */
          color: #fff;
          outline: 2px solid #76C4DC; /* nd-light-blue.400 */
        }
        .action-select {
          min-width: 130px;
          padding: 6px 14px;
          background: #4EB3D1; /* Ask Mode default */
          color: #113742;
          border-color: #319CBB;
          font-weight: bold;
        }
        .action-select.agent-mode {
          background: #0270DE; /* nd-dark-blue.400 */
          color: #fff;
          border-color: #013D79;
        }
        .action-select.ask-mode {
          background: #4EB3D1; /* nd-light-blue.500 */
          color: #113742;
          border-color: #319CBB;
        }
        .action-button#apply-changes {
          background: #0270DE; /* nd-dark-blue.400 */
          color: #fff;
          border-color: #013D79;
          font-weight: bold;
        }
        .action-button#apply-changes:hover, .action-button#apply-changes:focus-visible {
          background: #013D79; /* nd-dark-blue.500 */
          outline: 2px solid #76C4DC;
        }
        .action-button, .action-select {
          padding: 6px 14px;
          background: #4EB3D1;
          color: #113742;
        }
        .action-button:hover, .action-select:hover,
        .action-button:focus-visible, .action-select:focus-visible {
          background: #319CBB;
          color: #fff;
          outline: 2px solid #76C4DC;
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
          background: #319CBB;
          color: #fff;
          border: 1px solid #013D79;
          border-radius: 3px;
          padding: 2px 6px;
          opacity: 0.8;
          transition: opacity 0.2s, background 0.2s, color 0.2s;
        }
        .copy-button:hover, .copy-button:focus-visible {
          opacity: 1;
          background: #013D79;
          outline: 2px solid #76C4DC;
        }
        .copy-button:focus {
          outline: 2px solid #76C4DC;
        }
        @media (max-width: 600px) {
          body {
            font-size: 0.95rem;
          }
          .action-button, .action-select, pre, code {
            font-size: 0.9rem;
          }
        }
      </style>
    </head>
    <body>
      <div class="action-bar">
        <select id="mode-switch" class="action-select ask-mode">
          <option value="ask">Ask Mode</option>
          <option value="agent">Agent Mode</option>
        </select>
        <button id="save-button" class="action-button">Save Response</button>
        <button id="apply-changes" class="action-button" style="display: none;">Apply Changes</button>
      </div>
      <div id="content">Loading...</div>
      <script>
        (function() {
          const vscode = acquireVsCodeApi();
          let currentMode = 'ask';

          // Simple escapeHtml function for extra safety (though content is pre-sanitized)
          function escapeHtml(unsafe) {
            return unsafe
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
          }

          const modeSwitch = document.getElementById('mode-switch');
          function updateModeStyles() {
            if (modeSwitch.value === 'agent') {
              modeSwitch.classList.remove('ask-mode');
              modeSwitch.classList.add('agent-mode');
            } else {
              modeSwitch.classList.remove('agent-mode');
              modeSwitch.classList.add('ask-mode');
            }
          }
          updateModeStyles();
          modeSwitch.addEventListener('change', (e) => {
            currentMode = e.target.value;
            vscode.postMessage({ command: 'modeSwitch', mode: currentMode });
            document.getElementById('apply-changes').style.display = currentMode === 'agent' ? '' : 'none';
            updateModeStyles();
          });
          document.getElementById('save-button').addEventListener('click', () => {
            vscode.postMessage({ command: 'saveFile' });
          });
          document.getElementById('apply-changes').addEventListener('click', () => {
            vscode.postMessage({ command: 'applyChanges' });
          });
          function copyToClipboard(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(() => {
                vscode.postMessage({ command: 'showInfo', message: 'Code copied to clipboard!' });
              }, (err) => {
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
              const oldButton = wrapper.querySelector('.copy-button');
              if (oldButton) {
                oldButton.remove();
              }
              const copyButton = document.createElement('div');
              copyButton.className = 'copy-button';
              copyButton.innerHTML = '📋';
              copyButton.title = 'Copy code to clipboard';
              copyButton.setAttribute('tabindex', '0');
              copyButton.setAttribute('role', 'button');
              copyButton.setAttribute('aria-label', 'Copy code to clipboard');
              copyButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = codeBlock.innerText;
                copyToClipboard(code);
              });
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
              // Directly append pre-sanitized content (from extension)
              document.getElementById('content').innerHTML += message.content;
              setupCopyButtons();
            } else if (message.type === 'complete') {
              document.getElementById('content').innerHTML = message.html;
              setupCopyButtons();
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

async function getWorkspaceContext(): Promise<string> {
  const workspaceName = vscode.workspace.name || 'Untitled';
  const activeFile = vscode.window.activeTextEditor?.document.fileName || 'No active file';
  return `Workspace: ${workspaceName}\nActive File: ${activeFile}`;
}

// Replace all usage of tokenizeText and tiktoken-based logic with a simple heuristic
async function estimateTokens(text: string, files: string[] = []): Promise<number> {
  try {
    let total = text.split(/\s+/).length + 1;
    for (const file of files) {
      const content = await fs.promises.readFile(file, 'utf-8');
      total += content.split(/\s+/).length + 1;
    }
    return total;
  } catch {
    // Fallback heuristic
    const cleaned = text.trim().replace(/\s+/g, ' ');
    return Math.ceil((cleaned.length / 4) * 1.1);
  }
}

async function testGrokConnection(apiKey: string): Promise<boolean> {
  try {
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const modelName = config.get<string>('model') || 'grok-4-0709';
    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 30000 });
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 3,
      temperature: 0.1
    });
    return response.choices && response.choices.length > 0;
  } catch (error) {
    return false;
  }
}

// Core Functions
async function showGrokPanel(context: vscode.ExtensionContext, title: string, code: string, language: string, action: string, token: vscode.CancellationToken): Promise<void> {
  // Persistent rate limiting
  const state = context.globalState.get<{ count: number; lastReset: number }>(RATE_LIMIT_KEY, { count: 0, lastReset: Date.now() });
  const now = Date.now();
  if (now - state.lastReset > 60000) {
    state.count = 0;
    state.lastReset = now;
  }
  if (state.count >= MAX_REQUESTS_PER_MINUTE) {
    vscode.window.showErrorMessage('Rate limit exceeded. Please wait a minute.');
    return;
  }
  state.count++;
  await context.globalState.update(RATE_LIMIT_KEY, state);

  const config = vscode.workspace.getConfiguration('grokIntegration');
  let apiKey = config.get<string>('apiKey');
  const modelName = config.get<string>('model') || 'grok-4-0709';
  if (!modelName) {
    vscode.window.showWarningMessage('No Grok model is set. Please check your settings for available models.');
  }
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

  token.onCancellationRequested(() => {
    panel.dispose();
  });

  const rawMarkdownResponse = await processGrokRequest(panel, code, language, action, apiKey, token);

  let currentMode = 'ask';
  panel.webview.onDidReceiveMessage(
    async message => {
      if (message.command === 'saveFile') {
        if (rawMarkdownResponse) {
          const now = new Date();
          const day = String(now.getDate()).padStart(2, '0');
          const month = String(now.getMonth() + 1).padStart(2, '0');
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
      } else if (message.command === 'modeSwitch') {
        currentMode = message.mode;
      } else if (message.command === 'applyChanges') {
        if (currentMode === 'agent' && rawMarkdownResponse) {
          const changes = parseGrokCodeChanges(rawMarkdownResponse);
          if (changes.length === 0) {
            vscode.window.showErrorMessage('No code changes found in response.');
            return;
          }
          const workspaceRoot = vscode.workspace.rootPath || '';
          for (const change of changes) {
            try {
              // Security: Validate path - must be relative, no '..', and within workspace
              if (path.isAbsolute(change.file) || change.file.includes('..') || !change.file.startsWith('/')) {
                vscode.window.showErrorMessage(`Invalid file path: ${change.file}. Must be relative within workspace.`);
                continue;
              }
              const resolvedPath = path.normalize(path.join(workspaceRoot, change.file));
              if (!resolvedPath.startsWith(workspaceRoot)) {
                vscode.window.showErrorMessage(`Path traversal detected: ${change.file}. Skipping.`);
                continue;
              }
              const fileUri = vscode.Uri.file(resolvedPath);
              const doc = await vscode.workspace.openTextDocument(fileUri);
              const edit = new vscode.WorkspaceEdit();
              edit.replace(fileUri, new vscode.Range(0, 0, doc.lineCount, 0), change.code);
              await vscode.workspace.applyEdit(edit);
              await doc.save();
              vscode.window.showInformationMessage(`Applied Grok changes to ${change.file}`);
            } catch (err) {
              vscode.window.showErrorMessage(`Failed to apply changes to ${change.file}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        } else {
          vscode.window.showErrorMessage('Agent mode must be active and response must contain code changes.');
        }
      }
    },
    undefined,
    context.subscriptions
  );
}

// Helper to parse Grok markdown response for code changes
function parseGrokCodeChanges(markdown: string): Array<{file: string, code: string}> {
  const changes: Array<{file: string, code: string}> = [];
  const fileBlockRegex = /--- FILE: ([^\n]+) ---([\s\S]*?)```([a-zA-Z]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = fileBlockRegex.exec(markdown)) !== null) {
    const file = match[1].trim();
    const code = match[4];
    changes.push({ file, code });
  }
  return changes;
}

async function processGrokRequest(panel: vscode.WebviewPanel, code: string, language: string, action: string, apiKey: string, token: vscode.CancellationToken): Promise<string | undefined> {
  try {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      panel.webview.postMessage({ type: 'complete', html: '<p>❌ Error: API key is missing or invalid. Please set your xAI API key in settings.</p>' });
      return '# Error\n\nAPI key is missing or invalid.';
    }
    const openai = new OpenAI({ apiKey: apiKey.trim(), baseURL: 'https://api.x.ai/v1', timeout: 60000 });
    const redactedCode = redactSecrets(code);
    const prompt = `As Grok, ${action} this ${language} code:\n\n${redactedCode}`;
    const tokenCount = await estimateTokens(prompt);
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const maxTokens = config.get<number>('maxTokens') || 9000;
    if (tokenCount > maxTokens) {
      panel.webview.postMessage({ type: 'complete', html: `<p>❌ Request too large: estimated ${tokenCount} tokens exceeds your configured hard limit of ${maxTokens}. Please reduce your selection or increase the limit in settings.</p>` });
      return;
    }
    const modelName = config.get<string>('model') || 'grok-4-0709';
    const stream = await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.5,
      stream: true,
    });
    let fullResponse = '';
    for await (const chunk of stream) {
      if (token.isCancellationRequested) {
        return;
      }
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        // For incremental updates, sanitize as simple HTML
        panel.webview.postMessage({ type: 'update', content: purify.sanitize(content.replace(/\n/g, '<br>')) });
      }
    }
    panel.webview.postMessage({ type: 'complete', html: convertMarkdownToHtml(fullResponse) });
    return fullResponse;
  } catch (error) {
    let errorMsg = 'Unknown error';
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
    logExtensionError(error, 'processGrokRequest');
    panel.webview.postMessage({ type: 'complete', html: '<p>❌ Error: ' + purify.sanitize(errorMsg) + '</p>' });
    return `# Error\n\n${errorMsg}`;
  }
}

// Command Handlers
async function askGrokCommand(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found.');
    return;
  }
  const selection = editor.selection;
  const code = editor.document.getText(selection) || editor.document.getText();
  const language = editor.document.languageId;
  const action = 'explain'; // Default action for askGrokCommand
  await showGrokPanel(context, 'Grok Response', code, language, action, token);
}

async function explainCodeCommand(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found.');
    return;
  }
  const code = editor.document.getText(editor.selection) || editor.document.getText();
  const language = editor.document.languageId;
  await showGrokPanel(context, 'Grok Explanation', code, language, 'explain', token);
}

async function reviewCodeCommand(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found.');
    return;
  }
  const code = editor.document.getText(editor.selection) || editor.document.getText();
  const language = editor.document.languageId;
  await showGrokPanel(context, 'Grok Review', code, language, 'review and suggest improvements for', token);
}

async function suggestImprovementsCommand(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found.');
    return;
  }
  const code = editor.document.getText(editor.selection) || editor.document.getText();
  const language = editor.document.languageId;
  await showGrokPanel(context, 'Grok Suggestions', code, language, 'suggest improvements for', token);
}

async function askGrokInlineCommand(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showError
