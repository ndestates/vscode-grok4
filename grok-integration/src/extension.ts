import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';
import createDOMPurify from 'dompurify';
import { parseHTML } from 'linkedom';
import { marked } from 'marked';
import * as os from 'os';
import { LRUCache } from 'lru-cache';

// If the file exists, ensure it exports VALID_EXTENSIONS. Otherwise, create it as below:
import { EXCLUDE_LIST } from "./utils/exclude-list";
import { getGitLsFilesOutputAsArray } from "./utils/git";
import { VALID_EXTENSIONS } from "./utils/valid-extensions";


// Lightweight DOM setup for DOMPurify
const { window } = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
const purify = createDOMPurify(window as any);

// Rate limiting constants
const RATE_LIMIT_KEY = 'grokRateLimit';
const MAX_REQUESTS_PER_MINUTE = 20;

// Add these missing interfaces and constants at the top after the cache declaration
interface CacheEntry {
  response: string;
  timestamp: number;
  tokenCount: number;
}

// Cache will be initialized in activate() function with user settings
let cache: LRUCache<string, CacheEntry>;
let CACHE_TTL_MS: number;

// Initialize cache with user settings
function initializeCache(): void {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const maxItems = config.get<number>('cacheMaxItems') || 100;
  const ttlMinutes = config.get<number>('cacheTtlMinutes') || 30;
  
  CACHE_TTL_MS = ttlMinutes * 60 * 1000;
  cache = new LRUCache<string, CacheEntry>({ max: maxItems });
  
  console.log(`Grok cache initialized: max ${maxItems} items, TTL ${ttlMinutes} minutes`);
}

// Check if cache is enabled
function isCacheEnabled(): boolean {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  return config.get<boolean>('enableCache') ?? true;
}

// Utility Functions
// Add the missing generateCacheKey function
function generateCacheKey(code: string, language: string, action: string): string {
  // Input validation
  if (typeof code !== 'string' || typeof language !== 'string' || typeof action !== 'string') {
    throw new Error('generateCacheKey: All parameters must be strings');
  }
  
  try {
    const crypto = require('crypto');
    // Normalize inputs to ensure consistent keys
    const normalizedCode = code.trim();
    const normalizedLanguage = language.toLowerCase().trim();
    const normalizedAction = action.toLowerCase().trim();
    
    const content = `${normalizedAction}:${normalizedLanguage}:${normalizedCode}`;
    
    // Limit content length to prevent performance issues
    const truncatedContent = content.length > 50000 ? 
      content.substring(0, 50000) + `[TRUNCATED:${content.length}]` : content;
    
    return crypto.createHash('sha256').update(truncatedContent, 'utf8').digest('hex').substring(0, 16);
  } catch (error) {
    console.error('Error generating cache key:', error);
    // Fallback to simple hash
    return (code + language + action).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }
}

// Get from Cache
function getFromCache(key: string): CacheEntry | undefined {
  if (!cache || !isCacheEnabled() || typeof key !== 'string' || key.length === 0) {
    return undefined;
  }
  
  try {
    const cached = cache.get(key);
    if (cached) {
      // Validate cache entry structure
      if (!cached.timestamp || !cached.response || typeof cached.timestamp !== 'number') {
        console.warn(`Invalid cache entry found for key: ${key}`);
        cache.delete(key);
        return undefined;
      }
      
      // Check if cache entry is still valid (not expired)
      const config = vscode.workspace.getConfiguration('grokIntegration');
      const ttlMinutes = config.get<number>('cacheTtlMinutes') || 30;
      const ttlMs = ttlMinutes * 60 * 1000;
      const isExpired = Date.now() - cached.timestamp > ttlMs;
      
      if (isExpired) {
        cache.delete(key);
        return undefined;
      }
      return cached;
    }
    return undefined;
  } catch (error) {
    console.error('Error retrieving from cache:', error);
    return undefined;
  }
}

// Set to Cache
function setToCache(key: string, response: string, tokenCount: number): void {
  if (!cache || !isCacheEnabled() || typeof key !== 'string' || typeof response !== 'string') {
    return;
  }
  
  // Validate inputs
  if (key.length === 0 || response.length === 0) {
    return;
  }
  
  // Check response size limit (prevent memory abuse)
  const maxResponseSize = 1000000; // 1MB
  if (response.length > maxResponseSize) {
    console.warn(`Response too large for caching: ${response.length} bytes`);
    return;
  }
  
  try {
    const cacheEntry: CacheEntry = {
      response,
      timestamp: Date.now(),
      tokenCount
    };
    cache.set(key, cacheEntry);
  } catch (error) {
    console.error('Error setting cache entry:', error);
  }
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
  // Input validation
  if (typeof text !== 'string') {
    return '';
  }
  
  if (text.length === 0) {
    return text;
  }
  
  try {
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
      .replace(/"/g, '\\"')
      // Remove null bytes that can cause issues
      .replace(/\0/g, '')
      // Limit extremely long strings to prevent memory issues
      .substring(0, 1000000); // 1MB limit
  } catch (error) {
    console.error('Error sanitizing text for JSON:', error);
    return ''; // Return empty string on error
  }
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
  // Input validation
  if (typeof text !== 'string') {
    return 0;
  }
  
  if (text.length === 0) {
    return 0;
  }
  
  // Validate files array
  if (!Array.isArray(files)) {
    files = [];
  }
  
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const multiplier = Math.max(1.0, Math.min(2.0, config.get<number>('tokenMultiplier') || 1.1)); // Clamp between 1.0 and 2.0
  
  try {
    // Improved token estimation using more accurate word counting
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    let total = Math.ceil(words.length * multiplier);
    
    // Add tokens for special characters and punctuation (rough estimate)
    const specialChars = (text.match(/[^\w\s]/g) || []).length;
    total += Math.ceil(specialChars * 0.1 * multiplier);
    
    // Process files if provided
    for (const file of files) {
      try {
        if (typeof file !== 'string' || file.length === 0) {
          continue;
        }
        
        const content = await fs.promises.readFile(file, 'utf-8');
        if (content && content.length > 0) {
          const fileWords = content.trim().split(/\s+/).filter(word => word.length > 0);
          total += Math.ceil(fileWords.length * multiplier);
          
          const fileSpecialChars = (content.match(/[^\w\s]/g) || []).length;
          total += Math.ceil(fileSpecialChars * 0.1 * multiplier);
        }
      } catch (fileError) {
        console.warn(`Error reading file ${file} for token estimation:`, fileError);
        // Continue with other files
      }
    }
    
    return Math.max(1, total); // Ensure at least 1 token
  } catch (error) {
    console.warn('Error in token estimation, falling back to character count:', error);
    // Fallback: rough character-based estimation
    const cleaned = text.trim().replace(/\s+/g, ' ');
    const estimated = Math.ceil((cleaned.length / 4) * multiplier);
    return Math.max(1, estimated);
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
  const panel = vscode.window.createWebviewPanel('grokResponse', title, vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
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
                
                let doc: vscode.TextDocument;
                try {
                  doc = await vscode.workspace.openTextDocument(fileUri);
                } catch (openError) {
                  // File doesn't exist, create it if the action is appropriate
                  if (change.action === 'replace' || change.action === 'insert') {
                    await vscode.workspace.fs.writeFile(fileUri, Buffer.from('', 'utf8'));
                    doc = await vscode.workspace.openTextDocument(fileUri);
                  } else {
                    throw openError;
                  }
                }
                
                const edit = new vscode.WorkspaceEdit();
                
                // Apply different types of changes based on action and line information
                if (change.lineStart !== undefined && change.lineEnd !== undefined) {
                  // Specific line range replacement
                  const startPos = new vscode.Position(Math.max(0, change.lineStart - 1), 0);
                  const endPos = new vscode.Position(Math.min(doc.lineCount - 1, change.lineEnd - 1), doc.lineAt(Math.min(doc.lineCount - 1, change.lineEnd - 1)).text.length);
                  edit.replace(fileUri, new vscode.Range(startPos, endPos), change.code);
                } else if (change.action === 'append') {
                  // Append to end of file
                  const lastLine = doc.lineCount - 1;
                  const lastLineLength = doc.lineAt(lastLine).text.length;
                  const appendPos = new vscode.Position(lastLine, lastLineLength);
                  edit.insert(fileUri, appendPos, '\n' + change.code);
                } else if (change.action === 'prepend') {
                  // Insert at beginning of file
                  const startPos = new vscode.Position(0, 0);
                  edit.insert(fileUri, startPos, change.code + '\n');
                } else {
                  // Default behavior: try to find and replace similar code, or warn about full replacement
                  const fileContent = doc.getText();
                  
                  // Try to find a similar code block to replace
                  const lines = change.code.split('\n');
                  const searchPattern = lines[0].trim(); // Use first line as search pattern
                  
                  if (searchPattern && fileContent.includes(searchPattern)) {
                    // Try to find the existing code and replace it intelligently
                    const fileLines = fileContent.split('\n');
                    let foundIndex = -1;
                    
                    for (let i = 0; i < fileLines.length; i++) {
                      if (fileLines[i].trim() === searchPattern) {
                        foundIndex = i;
                        break;
                      }
                    }
                    
                    if (foundIndex >= 0) {
                      // Replace from the found line, trying to match the scope of the change
                      const startPos = new vscode.Position(foundIndex, 0);
                      // For now, replace just the matching line - this could be enhanced further
                      const endPos = new vscode.Position(foundIndex, fileLines[foundIndex].length);
                      edit.replace(fileUri, new vscode.Range(startPos, endPos), change.code);
                    } else {
                      // Fallback: append the code with a warning
                      const lastLine = doc.lineCount - 1;
                      const lastLineLength = doc.lineAt(lastLine).text.length;
                      const appendPos = new vscode.Position(lastLine, lastLineLength);
                      edit.insert(fileUri, appendPos, '\n\n// === GROK SUGGESTED CODE (please review and place appropriately) ===\n' + change.code + '\n// === END GROK SUGGESTION ===\n');
                      vscode.window.showWarningMessage(`Could not find exact location for changes in ${change.file}. Code added at end of file with markers.`);
                    }
                  } else {
                    // No matching content found, ask user for confirmation before full file replacement
                    const userChoice = await vscode.window.showWarningMessage(
                      `Grok wants to replace the entire content of ${change.file}. This will erase all existing code. Continue?`,
                      { modal: true },
                      'Replace Entire File',
                      'Append with Markers',
                      'Skip'
                    );
                    
                    if (userChoice === 'Replace Entire File') {
                      edit.replace(fileUri, new vscode.Range(0, 0, doc.lineCount, 0), change.code);
                    } else if (userChoice === 'Append with Markers') {
                      const lastLine = doc.lineCount - 1;
                      const lastLineLength = doc.lineAt(lastLine).text.length;
                      const appendPos = new vscode.Position(lastLine, lastLineLength);
                      edit.insert(fileUri, appendPos, '\n\n// === GROK SUGGESTED CODE (please review and place appropriately) ===\n' + change.code + '\n// === END GROK SUGGESTION ===\n');
                    } else {
                      vscode.window.showInformationMessage(`Skipped changes to ${change.file}`);
                      continue;
                    }
                  }
                }
                
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
function parseGrokCodeChanges(markdown: string): Array<{file: string, code: string, action?: string, lineStart?: number, lineEnd?: number}> {
  const changes: Array<{file: string, code: string, action?: string, lineStart?: number, lineEnd?: number}> = [];
  
  // Input validation
  if (!markdown || typeof markdown !== 'string') {
    return changes;
  }
  
  // Enhanced pattern to capture different types of changes
  const fileBlockRegex = /--- FILE: ([^\n]+) ---([\s\S]*?)```([a-zA-Z]*)\n([\s\S]*?)```/g;
  let match;
  let iterationCount = 0;
  const maxIterations = 100; // Prevent infinite loops
  
  while ((match = fileBlockRegex.exec(markdown)) !== null && iterationCount < maxIterations) {
    iterationCount++;
    
    const file = match[1]?.trim();
    const code = match[4];
    const context = match[2] || ''; // Content between file declaration and code block
    
    // Validate file path
    if (!file || file.length === 0) {
      console.warn('Skipping code change with empty file path');
      continue;
    }
    
    // Security check: validate file path
    if (file.includes('..') || path.isAbsolute(file)) {
      console.warn(`Skipping potentially unsafe file path: ${file}`);
      continue;
    }
    
    // Validate code content
    if (code === undefined || code === null) {
      console.warn(`Skipping code change with no content for file: ${file}`);
      continue;
    }
    
    // Try to extract action and line range from context
    let action = 'replace'; // default action
    let lineStart: number | undefined;
    let lineEnd: number | undefined;
    
    // Look for action indicators in the context
    const actionMatch = context.match(/(?:action|operation):\s*(replace|insert|append|prepend)/i);
    if (actionMatch) {
      const detectedAction = actionMatch[1].toLowerCase();
      if (['replace', 'insert', 'append', 'prepend'].includes(detectedAction)) {
        action = detectedAction;
      }
    }
    
    // Look for line range indicators
    const lineRangeMatch = context.match(/lines?\s*(\d+)(?:\s*-\s*(\d+))?/i);
    if (lineRangeMatch) {
      const startLine = parseInt(lineRangeMatch[1], 10);
      const endLine = lineRangeMatch[2] ? parseInt(lineRangeMatch[2], 10) : startLine;
      
      // Validate line numbers
      if (startLine > 0 && endLine >= startLine && endLine <= 10000) { // Reasonable limits
        lineStart = startLine;
        lineEnd = endLine;
      } else {
        console.warn(`Invalid line range ${startLine}-${endLine} for file: ${file}`);
      }
    }
    
    changes.push({ file, code, action, lineStart, lineEnd });
  }
  
  if (iterationCount >= maxIterations) {
    console.warn('parseGrokCodeChanges: Maximum iterations reached, possible infinite loop prevented');
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
    const cacheEnabled = isCacheEnabled();
    
    // Sanitize code for JSON safety first, then redact secrets
    const sanitizedCode = sanitizeForJson(code);
    const redactedCode = redactSecrets(sanitizedCode);
    
    // Generate cache key from non-sensitive content
    const cacheKey = generateCacheKey(sanitizedCode, language, action);
    
    // Check cache first if enabled
    if (cacheEnabled) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        vscode.window.showInformationMessage('📦 Using cached response');
        panel.webview.postMessage({ type: 'complete', html: convertMarkdownToHtml(cached.response) });
        return cached.response;
      }
    }

    const openai = new OpenAI({ apiKey: apiKey.trim(), baseURL: 'https://api.x.ai/v1', timeout: 60000 });
    
    // Enhanced prompt with guidance for code changes
    const basePrompt = `As Grok, ${action} this ${language} code:\n\n${redactedCode}`;
    
    const agentModeGuidance = `\n\nIMPORTANT: If you need to suggest code changes that should be applied to files, format them using this structure:

--- FILE: relative/path/to/file.ext ---
action: replace/insert/append/prepend
lines: startLine-endLine (optional, for specific line ranges)
\`\`\`${language}
// Your code changes here
\`\`\`

Examples:
- For replacing specific lines: "action: replace" and "lines: 10-15"
- For adding at end: "action: append"
- For adding at beginning: "action: prepend"
- For inserting new code: "action: insert" and "lines: 25" (insert after line 25)

Only use this format if you're providing code that should be applied to existing files. For explanations and discussions, use regular markdown.`;

    const prompt = basePrompt + (action.includes('edit') || action.includes('modify') || action.includes('refactor') || action.includes('fix') ? agentModeGuidance : '');
    
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
      messages: [
        { 
          role: 'system', 
          content: 'You are a direct and professional AI programming assistant. You are working as a pair programmer.  Please provide accurate, concise answers with NO witty remarks, jokes, conversational filler, other than polite personality. Be strictly technical and efficient. When suggesting changes, your focus should always be security first, please clearly state which file each change belongs to using `--- FILE: path/to/file.ts ---` and also the line number it should be inserted at or which line numbers should be replaced. All code must be in proper markdown code blocks with the ability for the user to copy or apply to the relevant area. Focus only on the technical content requested.'
        },
        { 
          role: 'user', 
          content: `${action} this ${language} code:\n\n${redactedCode}` 
        }
      ],
      max_tokens: maxTokens,
      temperature: 0.2, // Lower temperature for more focused responses
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
      setToCache(cacheKey, fullResponse, tokenCount);
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

    const systemMessage = 'You are a direct and professional AI programming assistant. Provide accurate, concise answers with NO witty remarks, jokes, conversational filler, or personality. Be strictly technical and efficient and always focus on security first so that the user always has this as their focus. Give the user the reasons for the change, whether they are compulsory or as a suggestion (e,g., `--- This is suggested as compulsory to improve the security of your code---` or `--- This is suggested as a suggestion to improve your code---`).  The user has provided context from one or more files. When suggesting changes, clearly state which file each change belongs to using a markdown file block header (e.g., `--- FILE: path/to/file.ts ---`). Provide the line number where a code needs to replace items or be inserted. All code suggestions must be enclosed in a language-specific Markdown code block. Focus only on the technical content requested.';
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
    // Initialize cache with user settings
    initializeCache();
    
    // Listen for configuration changes to update cache settings
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('grokIntegration.cacheMaxItems') ||
            event.affectsConfiguration('grokIntegration.cacheTtlMinutes') ||
            event.affectsConfiguration('grokIntegration.enableCache')) {
          initializeCache(); // Reinitialize cache with new settings
          vscode.window.showInformationMessage('🔄 Grok cache settings updated.');
        }
      })
    );

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
        if (cache) {
          cache.clear();
          vscode.window.showInformationMessage('🗑️ Grok response cache cleared.');
        } else {
          vscode.window.showWarningMessage('Cache not initialized.');
        }
      }),
      vscode.commands.registerCommand('grok-integration.showCacheStats', async () => {
        if (cache) {
          const size = cache.size;
          const maxSize = cache.max;
          const cacheEnabled = isCacheEnabled();
          const config = vscode.workspace.getConfiguration('grokIntegration');
          const ttlMinutes = config.get<number>('cacheTtlMinutes') || 30;
          vscode.window.showInformationMessage(`📊 Cache: ${size}/${maxSize} entries, TTL: ${ttlMinutes}min, Enabled: ${cacheEnabled}`);
        } else {
          vscode.window.showWarningMessage('Cache not initialized.');
        }
      }),
      vscode.commands.registerCommand('grok-integration.resetCacheSettings', async () => {
        const proceed = await vscode.window.showWarningMessage(
          'This will reset cache settings to defaults and clear current cache. Continue?',
          'Yes', 'No'
        );
        if (proceed === 'Yes') {
          const config = vscode.workspace.getConfiguration('grokIntegration');
          await config.update('enableCache', true, vscode.ConfigurationTarget.Global);
          await config.update('cacheMaxItems', 100, vscode.ConfigurationTarget.Global);
          await config.update('cacheTtlMinutes', 30, vscode.ConfigurationTarget.Global);
          initializeCache(); // Reinitialize with new settings
          vscode.window.showInformationMessage('🔄 Cache settings reset to defaults.');
        }
      }),
      registerCancellableCommand('grok-integration.selectWorkspaceFiles', async (token) => await selectWorkspaceFilesCommand(context, token)),
      registerCancellableCommand('grok-integration.exportAllWorkspaceFiles', async (token) => await exportAllWorkspaceFilesCommand(context, token)),
      registerCancellableCommand('grok-integration.askGrokWorkspace', async (token) => await askGrokWorkspaceCommand(context, token)),
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

    // Declare operationCache at the top-level scope of activate
    let operationCache: { clear: () => void } | null = null;

    // Register a command for the cancel button
    const cancelCommand = vscode.commands.registerCommand('grok-integration.cancelOperation', () => {
        // Logic to cancel the ongoing operation
        // Example: if (ongoingProcess) ongoingProcess.cancel();

        // Dispose of memory and clear cache
        // Replace with your actual resources
        if (operationCache) {
            operationCache.clear();
            operationCache = null;
        }

        // Optional: Show a notification
        vscode.window.showInformationMessage('Operation cancelled and resources disposed.');
    });

    context.subscriptions.push(cancelCommand);

    // To add a cancel button, e.g., in the status bar
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'grok-integration.cancelOperation';
    statusBarItem.text = '$(close) Cancel';
    statusBarItem.tooltip = 'Cancel and dispose resources';
    statusBarItem.show(); // Show conditionally based on operation
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
    vscode.window.showErrorMessage(`Error reading file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// In your activate function, register the command for addFileContents
vscode.commands.registerCommand('grok-integration.addFileContents', async (uri) => {
  await addFileContents(uri);
});

// Add these utility functions after your existing utility functions
export function isValidExtension(uri: vscode.Uri): boolean {
  const filename = path.basename(uri.path);
  if (!filename) {
    return false;
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
  return new TextDecoder("utf-8").decode(fileContent);
}

export async function getFilesList(): Promise<vscode.Uri[]> {
  const gitFiles = await getGitLsFilesOutputAsArray();
  return gitFiles.filter(isValidExtension).filter(notOnExcludeList);
}

export async function getWorkspaceFilesContents(): Promise<{ path: string; content: string }[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error("No workspace folder open");
  }
  
  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const files = await getFilesList();
  const results: { path: string; content: string }[] = [];

  for (const fileUri of files) {
    try {
      const content = await readFileAsUtf8(fileUri);
      const relativePath = vscode.workspace.asRelativePath(fileUri);
      results.push({ path: relativePath, content });
    } catch (error) {
      console.error(`Failed to read file ${fileUri.path}: ${error}`);
    }
  }

  return results;
}

// Add new command handlers
async function selectWorkspaceFilesCommand(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  try {
    const files = await getFilesList();
    
    if (files.length === 0) {
      vscode.window.showInformationMessage('No valid files found in workspace.');
      return;
    }

    // Show quick pick to select multiple files
    const selectedFiles = await vscode.window.showQuickPick(
      files.map(fileUri => {
        const relativePath = vscode.workspace.asRelativePath(fileUri);
        return { 
          label: relativePath, 
          picked: false,
          description: path.extname(fileUri.path) || 'No extension',
          uri: fileUri
        };
      }),
      {
        canPickMany: true,
        placeHolder: 'Select files to export to Grok (use Ctrl/Cmd+click for multiple)',
        title: 'Workspace File Export'
      }
    );

    if (!selectedFiles || selectedFiles.length === 0) {
      vscode.window.showInformationMessage('No files selected.');
      return;
    }

    // Get user's instruction for what to do with the selected files
    const userInstruction = await vscode.window.showInputBox({
      prompt: `What would you like Grok to do with these ${selectedFiles.length} selected files?`,
      placeHolder: 'e.g., "Review for security vulnerabilities", "Explain the architecture", "Suggest improvements"',
      value: 'review and analyze'
    });

    if (!userInstruction) {
      vscode.window.showInformationMessage('Operation cancelled - no instruction provided.');
      return;
    }

    // Prepare context with selected files
    let combinedContent = '';

    for (const file of selectedFiles) {
      try {
        const content = await readFileAsUtf8(file.uri);
        combinedContent += `\n\n--- FILE: ${file.label} ---\n${content}\n--- END FILE ---`;
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to read ${file.label}: ${error}`);
      }
    }

    if (combinedContent) {
      await showGrokPanel(
        context, 
        `Workspace Export: ${userInstruction} (${selectedFiles.length} files)`, 
        combinedContent, 
        'multiple', 
        userInstruction, 
        token
      );
    }

  } catch (error) {
    vscode.window.showErrorMessage(`Error selecting workspace files: ${error instanceof Error ? error.message : String(error)}`);
    logExtensionError(error, 'selectWorkspaceFilesCommand');
  }
}

async function exportAllWorkspaceFilesCommand(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  try {
    const filesWithContent = await getWorkspaceFilesContents();
    
    if (filesWithContent.length === 0) {
      vscode.window.showInformationMessage('No valid files found in workspace.');
      return;
    }

    // Check if too many files
    if (filesWithContent.length > 50) {
      const proceed = await vscode.window.showWarningMessage(
        `Found ${filesWithContent.length} files. This might be too large for Grok. Continue?`,
        'Yes', 'No'
      );
      if (proceed !== 'Yes') {
        return;
      }
    }

    // Get user's instruction for what to do with all workspace files
    const userInstruction = await vscode.window.showInputBox({
      prompt: `What would you like Grok to do with all ${filesWithContent.length} workspace files?`,
      placeHolder: 'e.g., "Analyze the overall architecture", "Find potential issues", "Create documentation"',
      value: 'review and analyze the entire workspace'
    });

    if (!userInstruction) {
      vscode.window.showInformationMessage('Operation cancelled - no instruction provided.');
      return;
    }

    // Combine all file contents
    let combinedContent = '';
    for (const file of filesWithContent) {
      combinedContent += `\n\n--- FILE: ${file.path} ---\n${file.content}\n--- END FILE ---`;
    }

    await showGrokPanel(
      context, 
      `Full Workspace Export: ${userInstruction} (${filesWithContent.length} files)`, 
      combinedContent, 
      'multiple', 
      userInstruction, 
      token
    );

  } catch (error) {
    vscode.window.showErrorMessage(`Error exporting workspace: ${error instanceof Error ? error.message : String(error)}`);
    logExtensionError(error, 'exportAllWorkspaceFilesCommand');
  }
}

async function askGrokWorkspaceCommand(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  try {
    // Get user's custom prompt
    const userPrompt = await vscode.window.showInputBox({
      prompt: 'What would you like to ask Grok about your workspace?',
      placeHolder: 'e.g., "Explain the architecture" or "Find potential bugs"'
    });

    if (!userPrompt) {
      return;
    }

    const filesWithContent = await getWorkspaceFilesContents();
    
    if (filesWithContent.length === 0) {
      vscode.window.showInformationMessage('No valid files found in workspace.');
      return;
    }

    // Combine all file contents
    let combinedContent = `User Question: ${userPrompt}\n\nWorkspace Files:`;
    for (const file of filesWithContent) {
      combinedContent += `\n\n--- FILE: ${file.path} ---\n${file.content}\n--- END FILE ---`;
    }

    await showGrokPanel(
      context, 
      `Workspace Query: ${userPrompt}`, 
      combinedContent, 
      'multiple', 
      `answer the user's question: "${userPrompt}" based on`, 
      token
    );

  } catch (error) {
    vscode.window.showErrorMessage(`Error querying workspace: ${error instanceof Error ? error.message : String(error)}`);
    logExtensionError(error, 'askGrokWorkspaceCommand');
  }
}

export function deactivate() {
    // No explicit cleanup required; VSCode disposes subscriptions automatically.
}

// Export functions for testing
export {
    parseGrokCodeChanges,
    redactSecrets,
    sanitizeForJson,
    estimateTokens,
    generateCacheKey,
    convertMarkdownToHtml,
    notOnExcludeList
};