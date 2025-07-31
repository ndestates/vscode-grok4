import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';
import createDOMPurify from 'dompurify';
import { parseHTML } from 'linkedom';
import { marked } from 'marked';
import * as os from 'os';
import { LRUCache } from 'lru-cache';

// Lightweight DOM setup for DOMPurify
const { window } = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
const purify = createDOMPurify(window as any);

// Rate limiting constants
const RATE_LIMIT_KEY = 'grokRateLimit';
const MAX_REQUESTS_PER_MINUTE = 20;

// Create an LRU cache instance with a maximum of 100 items
const cache = new LRUCache<string, any>({ max: 100 });

// Utility Functions
// Add these missing interfaces and constants at the top after the cache declaration
interface CacheEntry {
  response: string;
  timestamp: number;
  tokenCount: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Add the missing generateCacheKey function
function generateCacheKey(code: string, language: string, action: string): string {
  const crypto = require('crypto');
  const content = `${action}:${language}:${code}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

// Fix the redactSecrets function to be more targeted and prevent Unicode corruption
function redactSecrets(text: string): string {
  return text
    // API keys (various formats)
    .replace(/(api[_-]?key\s*[:=]\s*["']?)([^"'\s\n]{10,})(["']?)/gi, '$1REDACTED$3')
    .replace(/(apikey\s*[:=]\s*["']?)([^"'\s\n]{10,})(["']?)/gi, '$1REDACTED$3')
    // Tokens
    .replace(/(token\s*[:=]\s*["']?)([^"'\s\n]{20,})(["']?)/gi, '$1REDACTED$3')
    .replace(/(bearer\s+)([a-zA-Z0-9._-]{20,})/gi, '$1REDACTED')
    // Passwords
    .replace(/(password\s*[:=]\s*["']?)([^"'\s\n]{3,})(["']?)/gi, '$1REDACTED$3')
    .replace(/(passwd\s*[:=]\s*["']?)([^"'\s\n]{3,})(["']?)/gi, '$1REDACTED$3')
    // JWT tokens (more specific pattern)
    .replace(/\b(eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*)\b/g, 'JWT_TOKEN_REDACTED')
    // Email addresses (PII)
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 'EMAIL_REDACTED')
    // Phone numbers (basic patterns)
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, 'PHONE_REDACTED')
    // SSH private keys
    .replace(/(-----BEGIN [A-Z ]+PRIVATE KEY-----)([\s\S]*?)(-----END [A-Z ]+PRIVATE KEY-----)/gi, '$1\nREDACTED\n$3');
}

// Add this missing sanitizeForJson function
function sanitizeForJson(text: string): string {
  return text
    // Fix incomplete Unicode escapes by removing them
    .replace(/\\u[0-9A-Fa-f]{1,3}(?![0-9A-Fa-f])/g, '')
    // Remove other potentially problematic escape sequences
    .replace(/\\x[0-9A-Fa-f]{1}(?![0-9A-Fa-f])/g, '')
    // Handle control characters that might break JSON
    .replace(/[\x00-\x1F\x7F]/g, (char) => {
      switch (char) {
        case '\n': return '\\n';
        case '\r': return '\\r';
        case '\t': return '\\t';
        case '\b': return '\\b';
        case '\f': return '\\f';
        default: return ''; // Remove other control characters
      }
    })
    // Escape backslashes and quotes for JSON safety
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
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

// Updated estimateTokens function with configurable multiplier
async function estimateTokens(text: string, files: string[] = []): Promise<number> {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const multiplier = config.get<number>('tokenMultiplier') || 1.1;  // Allow configuration via settings
  try {
    let total = Math.ceil((text.split(/\s+/).length + 1) * multiplier);
    for (const file of files) {
      const content = await fs.promises.readFile(file, 'utf-8');
      total += Math.ceil((content.split(/\s+/).length + 1) * multiplier);
    }
    return total;
  } catch {
    const cleaned = text.trim().replace(/\s+/g, ' ');
    return Math.ceil((cleaned.length / 4) * multiplier);
  }
}

async function testGrokConnection(apiKey: string): Promise<boolean> {
  try {
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const modelName = config.get<string>('model') || 'grok-3-mini';
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
  const modelName = config.get<string>('model') || 'grok-3-mini';
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
        if (rawMarkdownResponse) {
          const changes = parseGrokCodeChanges(rawMarkdownResponse);
          if (changes.length === 0) {
            vscode.window.showErrorMessage('No code changes found in response.');
            return;
          }
          const applyChanges = async () => {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            for (const change of changes) {
              try {
                let filePath = change.file;
                if (filePath.startsWith('/')) {
                  filePath = filePath.slice(1);
                }
                // Security: Validate path - must be relative, no '..', and within workspace
                if (path.isAbsolute(filePath) || filePath.includes('..')) {
                  vscode.window.showErrorMessage(`Invalid file path: ${change.file}. Must be relative within workspace without '..'.`);
                  continue;
                }
                const resolvedPath = path.normalize(path.join(workspaceRoot, filePath));
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
          };

          if (currentMode === 'agent') {
            await applyChanges();
          } else if (currentMode === 'ask') {
            const confirmation = await vscode.window.showQuickPick(['Yes', 'No'], {
              placeHolder: 'Apply suggested code changes?'
            });
            if (confirmation === 'Yes') {
              await applyChanges();
            }
          } else {
            vscode.window.showErrorMessage('Invalid mode for applying changes.');
          }
        } else {
          vscode.window.showErrorMessage('No response content available.');
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

// Update processGrokRequest to include caching
async function processGrokRequest(panel: vscode.WebviewPanel, code: string, language: string, action: string, apiKey: string, token: vscode.CancellationToken): Promise<string | undefined> {
  try {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      panel.webview.postMessage({ type: 'complete', html: '<p>❌ Error: API key is missing or invalid. Please set your xAI API key in settings.</p>' });
      return '# Error\n\nAPI key is missing or invalid.';
    }

    const config = vscode.workspace.getConfiguration('grokIntegration');
    const cacheEnabled = config.get<boolean>('enableCache') ?? true;
    
    // Sanitize code for JSON safety first, then redact secrets
    const sanitizedCode = sanitizeForJson(code);
    const redactedCode = redactSecrets(sanitizedCode);
    
    // Generate cache key from non-sensitive content
    const cacheKey = generateCacheKey(sanitizedCode, language, action);
    
    // Check cache first if enabled
    if (cacheEnabled && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey) as CacheEntry;
      const isExpired = Date.now() - cached.timestamp > CACHE_TTL_MS;
      
      if (!isExpired) {
        vscode.window.showInformationMessage('📦 Using cached response');
        panel.webview.postMessage({ type: 'complete', html: convertMarkdownToHtml(cached.response) });
        return cached.response;
      } else {
        cache.delete(cacheKey);
      }
    }

    const openai = new OpenAI({ apiKey: apiKey.trim(), baseURL: 'https://api.x.ai/v1', timeout: 60000 });
    
    const prompt = `As Grok, ${action} this ${language} code:\n\n${redactedCode}`;
    
    const tokenCount = await estimateTokens(prompt);
    const maxTokens = config.get<number>('maxTokens') || 9000;
    
    if (tokenCount > maxTokens) {
      panel.webview.postMessage({ type: 'complete', html: `<p>❌ Request too large: estimated ${tokenCount} tokens exceeds your configured hard limit of ${maxTokens}. Please reduce your selection or increase the limit in settings.</p>` });
      return;
    }

    const modelName = config.get<string>('model') || 'grok-3-mini';
    
    // Validate the message content before sending
    try {
      JSON.stringify([{ role: 'user', content: prompt }]);
    } catch (jsonError) {
      panel.webview.postMessage({ type: 'complete', html: '<p>❌ Error: Content contains invalid characters for JSON transmission. Please check for malformed Unicode sequences.</p>' });
      return '# Error\n\nContent contains invalid JSON characters.';
    }
    
    const stream = await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.5,
      stream: true,
    });
    
    let fullResponse = '';
    for await (const chunk of stream) {
      if (token.isCancellationRequested) return;
      const content = chunk.choices[0]?.delta?.content || '';
      if (content && fullResponse.length < 50000) {
        fullResponse += content;
        panel.webview.postMessage({ type: 'update', content: purify.sanitize(content.replace(/\n/g, '<br>')) });
      }
    }

    // Cache the response if enabled
    if (cacheEnabled && fullResponse) {
      const cacheEntry: CacheEntry = {
        response: fullResponse,
        timestamp: Date.now(),
        tokenCount: tokenCount
      };
      cache.set(cacheKey, cacheEntry);
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
    vscode.window.showErrorMessage('No active editor found.');
    return;
  }
  const code = editor.document.getText(editor.selection) || editor.document.getText();
  const language = editor.document.languageId;
  await showGrokPanel(context, 'Grok Inline', code, language, 'respond to', token);
}

async function editWithGrokCommand(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found.');
    return;
  }
  const code = editor.document.getText(editor.selection) || editor.document.getText();
  const language = editor.document.languageId;
  await showGrokPanel(context, 'Edit with Grok', code, language, 'edit', token);
}

async function showTokenCountCommand(token: vscode.CancellationToken) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found.');
    return;
  }
  const code = editor.document.getText(editor.selection) || editor.document.getText();
  const tokenCount = await estimateTokens(code);
  vscode.window.showInformationMessage(`Estimated token count: ${tokenCount}`);
}

async function securityFixCommand(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found.');
    return;
  }
  const code = editor.document.getText(editor.selection) || editor.document.getText();
  const language = editor.document.languageId;
  await showGrokPanel(context, 'Security Fix', code, language, 'find and fix security vulnerabilities in', token);
}

async function showErrorLogCommand() {
  const logFile = path.join(os.homedir(), '.vscode-grok-logs', 'error.log');
  if (!fs.existsSync(logFile)) {
    vscode.window.showInformationMessage('No error log found.');
    return;
  }
  const doc = await vscode.workspace.openTextDocument(logFile);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function clearErrorLogCommand() {
  const logFile = path.join(os.homedir(), '.vscode-grok-logs', 'error.log');
  if (fs.existsSync(logFile)) {
    try {
      fs.unlinkSync(logFile);
      vscode.window.showInformationMessage('Grok error log cleared.');
    } catch (err) {
      vscode.window.showErrorMessage('Failed to clear error log: ' + (err instanceof Error ? err.message : String(err)));
      logExtensionError(err, 'clearErrorLogCommand');
    }
  } else {
    vscode.window.showInformationMessage('No error log found to clear.');
  }
}

// Error Logging
function logExtensionError(error: any, context: string = '') {
  try {
    const logDir = path.join(os.homedir(), '.vscode-grok-logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, 'error.log');
    const timestamp = new Date().toISOString();
    let errorMsg = '';
    if (error instanceof Error) {
      errorMsg = error.stack || error.message;
    } else {
      try {
        errorMsg = JSON.stringify(error);
      } catch {
        errorMsg = String(error);
      }
    }
    const logEntry = `[${timestamp}] ${context}: ${errorMsg}\n`;
    fs.appendFileSync(logFile, logEntry);
  } catch (e) {
    console.error('Failed to log extension error:', e);
  }
}

// Chat Handler
const chatHandler = {
  async handleRequest(request: vscode.ChatRequest, chatContext: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<vscode.ChatResult> {
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const apiKey = config.get<string>('apiKey');
    const modelName = config.get<string>('model') || 'grok-3-mini';
    
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      stream.markdown('❌ **API Key Required**: Please set your xAI API key in settings.\n\n[Open Settings](command:workbench.action.openSettings?%5B%22grokIntegration.apiKey%22%5D)');
      return {};
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
          const fileCount = fileUris.length;
          const fileWord = fileCount === 1 ? 'file' : 'files';
          let filePathsList = fileUris.slice(0, 5)
            .map(uri => {
              const rel = vscode.workspace.asRelativePath(uri);
              return `- ${uri.fsPath} (relative: ${rel})`;
            })
            .join('\n');
          if (fileCount > 5) {
            filePathsList += `\n...and ${fileCount - 5} more ${fileWord} selected.`;
          }
          const YES_BUTTON = 'Yes, Send Content';
          const NO_BUTTON = 'No, Cancel';
          const PRIVACY_NOTE = '\n\nNote: File contents will be sent securely to the xAI API for processing. Sensitive data like API keys and PII will be automatically redacted.';
          const consent = await vscode.window.showWarningMessage(
            `Do you consent to sending the content of the following ${fileWord} to the xAI API?${PRIVACY_NOTE}\n\n${filePathsList}`,
            { modal: true },
            YES_BUTTON,
            NO_BUTTON
          );
          if (consent === YES_BUTTON) {
            vscode.window.showInformationMessage(`Sending ${fileCount} ${fileWord} to xAI... Sensitive data will be redacted.`);
          } else if (consent === NO_BUTTON) {
            vscode.window.showInformationMessage('Operation cancelled. Your files are safe with you.');
            return {};
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Error preparing file consent: ${errorMsg}`);
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

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const selectionCode = editor.document.getText(editor.selection);
      if (selectionCode) {
        const language = editor.document.languageId;
        fullContext += `\n\n--- ACTIVE SELECTION (${language}) ---\n${selectionCode}\n--- END SELECTION ---`;
      }
    }

    // Apply sanitization first, then targeted redaction
    const sanitizedContext = sanitizeForJson(fullContext);
    const redactedContext = redactSecrets(sanitizedContext);
    const workspaceInfo = await getWorkspaceContext();
    const userPrompt = request.prompt || 'Hello';

    const systemMessage = 'You are a direct and professional AI programming assistant. Provide accurate, concise answers without any witty remarks or conversational filler. The user has provided context from one or more files. When suggesting changes, clearly state which file each change belongs to using a markdown file block header (e.g., `--- FILE: path/to/file.ts ---`). All code suggestions must be enclosed in a language-specific Markdown code block. For example:\n```typescript\n// your typescript code here\n```';
    const userMessage = `Task: ${action} the following. User prompt: "${userPrompt}"\n\nHere is the full context from the user's workspace:${redactedContext}\n\nWorkspace Info: ${workspaceInfo}`;

    const maxTokens = config.get<number>('maxTokens') || 9000;
    const tokenCount = await estimateTokens(systemMessage + userMessage);
    if (tokenCount > maxTokens) {
      stream.markdown(`❌ Request too large: estimated ${tokenCount} tokens exceeds your configured hard limit of ${maxTokens}. Please reduce your selection or increase the limit in settings.`);
      return {};
    }

    try {
      // Validate JSON before sending
      JSON.stringify([
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ]);
      
      stream.progress('🔍 Connecting to Grok...');
      const response = await openai.chat.completions.create({
        model: modelName,
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
          return {};
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
      if (errorMsg.includes('unexpected end of hex escape')) {
        stream.markdown('❌ **Error**: Content contains malformed Unicode sequences. The text has been sanitized and the request should work on retry.');
      } else {
        stream.markdown(`❌ **Error**: ${errorMsg}\n\nPlease check your API key and try again.`);
      }
    }

    return {};
  }
};

// Extension Lifecycle
export async function activate(context: vscode.ExtensionContext) {
  try {
    // Track request count for rate limiting
    let requestCount = 0;
    // Reset requestCount every minute
    const rateLimitInterval = setInterval(() => {
      requestCount = 0;
    }, 60000);
    context.subscriptions.push({
      dispose: () => {
        clearInterval(rateLimitInterval);
      }
    });

    const participant = vscode.chat.createChatParticipant('grok-integration.grok', chatHandler.handleRequest.bind(chatHandler));
    participant.iconPath = new vscode.ThemeIcon('hubot');
    participant.followupProvider = {
      provideFollowups(result: vscode.ChatResult, chatContext: vscode.ChatContext, token: vscode.CancellationToken) {
        return [
          { prompt: 'Explain this in more detail', label: '🔍 More details', command: 'grok-integration.explainCode' },
          { prompt: 'Show me an example', label: '💡 Show example' },
          { prompt: 'How can I improve this code?', label: '⚡ Improve code', command: 'grok-integration.reviewCode' }
        ];
      }
    };
    context.subscriptions.push(participant);

    const registerCancellableCommand = (commandId: string, task: (token: vscode.CancellationToken) => Promise<void>) => {
      return vscode.commands.registerCommand(commandId, () => {
        return vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Grok: ${commandId.split('.').pop()}`,
          cancellable: true
        }, async (progress, token) => {
          try {
            await task(token);
          } catch (err) {
            vscode.window.showErrorMessage(`Error in ${commandId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        });
      });
    };

    const commands = [
      registerCancellableCommand('grok-integration.askGrok', async (token) => await askGrokCommand(context, token)),
      registerCancellableCommand('grok-integration.explainCode', async (token) => await explainCodeCommand(context, token)),
      registerCancellableCommand('grok-integration.reviewCode', async (token) => await reviewCodeCommand(context, token)),
      registerCancellableCommand('grok-integration.suggestImprovements', async (token) => await suggestImprovementsCommand(context, token)),
      registerCancellableCommand('grok-integration.askGrokInline', async (token) => await askGrokInlineCommand(context, token)),
      registerCancellableCommand('grok-integration.editWithGrok', async (token) => await editWithGrokCommand(context, token)),
      registerCancellableCommand('grok-integration.showTokenCount', async (token) => await showTokenCountCommand(token)),
      vscode.commands.registerCommand('grok-integration.testConnection', async () => {
        const config = vscode.workspace.getConfiguration('grokIntegration');
        const apiKey = config.get<string>('apiKey');
        if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
          vscode.window.showErrorMessage('API key is required to test connection.');
          return;
        }
        vscode.window.showInformationMessage('Testing connection to Grok...');
        const success = await testGrokConnection(apiKey);
        if (success) {
          vscode.window.showInformationMessage('✅ Successfully connected to Grok API!');
        } else {
          vscode.window.showErrorMessage('❌ Failed to connect to Grok API. Please check your API key and network.');
        }
      }),
      registerCancellableCommand('grok-integration.securityFix', async (token) => await securityFixCommand(context, token)),
      registerCancellableCommand('grok-integration.explainCodeContext', async (token) => await explainCodeCommand(context, token)),
      registerCancellableCommand('grok-integration.reviewCodeContext', async (token) => await reviewCodeCommand(context, token)),
      registerCancellableCommand('grok-integration.showErrorLog', async () => await showErrorLogCommand()),
      registerCancellableCommand('grok-integration.clearErrorLog', async () => await clearErrorLogCommand()),
      vscode.commands.registerCommand('grok-integration.clearCache', async () => {
        cache.clear();
        vscode.window.showInformationMessage('🗑️ Grok response cache cleared.');
      }),
      vscode.commands.registerCommand('grok-integration.showCacheStats', async () => {
        const size = cache.size;
        const maxSize = cache.max;
        vscode.window.showInformationMessage(`📊 Cache: ${size}/${maxSize} entries`);
      }),
    ];
    context.subscriptions.push(...commands);

    vscode.window.showInformationMessage('🤖 Grok Integration activated! Try @grok in chat or right-click selected code.');

    // Example: Add a new command for AI query integration
    const grokCommand = vscode.commands.registerCommand('extension.grokQuery', async () => {
        const input = await vscode.window.showInputBox({ prompt: 'Ask a question' });
        if (input) {
            // Replace with actual API call, e.g., fetch from an AI endpoint
            vscode.window.showInformationMessage(`Processing query: ${input}`);
        }
    });

    context.subscriptions.push(grokCommand);
  } catch (error) {
    console.error('❌ Extension activation failed:', error);
    vscode.window.showErrorMessage(`Failed to activate Grok Integration: ${error instanceof Error ? error.message : String(error)}`);
    logExtensionError(error, 'Extension Activation');
  }
}
// Assuming you have a function that prepares the request body
async function sendRequest() {
    try {
        const messages = [
            { content: "Valid string here" }, // Example for messages[0]
            { content: "Check this for incomplete escapes, e.g., fix \\u123 to \\u1234" } // messages[1].content
            // Add other elements as needed
        ];

        // Validate the JSON structure
        const requestBody = JSON.stringify(messages);
        JSON.parse(requestBody);  // This will throw an error if JSON is invalid

        // Proceed with the request (e.g., using fetch or axios)
        const response = await fetch('/your-endpoint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody
        });
        // Handle response...
    } catch (error) {
        const errorMsg = (error instanceof Error) ? error.message : String(error);
        vscode.window.showErrorMessage(`JSON Error: ${errorMsg}`);
        // Log or debug the error for further inspection
    }
}

// New function to add file contents
export async function addFileContents(uri: vscode.Uri) {
  if (!uri) {
    // If no URI provided, assume it's called without context; show error or handle accordingly
    vscode.window.showErrorMessage('No file selected.');
    return;
  }

  try {
    const content = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(content);
    
    // Logic to add file contents (replace with your specific use case, e.g., append to a chat context or global state)
    // Example: Append to a global context or display in output
    const outputChannel = vscode.window.createOutputChannel('Grok File Contents');
    outputChannel.appendLine(`File: ${uri.fsPath}`);
    outputChannel.appendLine(text);
    outputChannel.show();

    vscode.window.showInformationMessage(`Added contents of ${uri.fsPath}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Error reading file: ${error.message}`);
  }
}

// In your activate function, register the command for addFileContents
vscode.commands.registerCommand('grok-integration.addFileContents', async (uri) => {
  await addFileContents(uri);
});

export function deactivate() {
    // Dispose of all subscriptions in the extension context
    if (context && context.subscriptions) {
        context.subscriptions.forEach(disposable => disposable.dispose());
    }

    // Clear any global caches or memory-intensive objects
    // Replace 'globalCache' with your actual cache variable(s)
    if (globalCache) {
        globalCache.clear();
        globalCache = null;
    }

    // Add any other cleanup logic, e.g., closing connections or stopping services
    // Example: if (someService) someService.stop();
}

