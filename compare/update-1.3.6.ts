// segment1-imports.ts

import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import DOMPurify from 'dompurify'; // For sanitizing HTML
import { encode } from 'gpt-tokenizer'; // For token estimation

// Rate limiting: Simple in-memory counter (reset every minute)
let requestCount = 0;
const MAX_REQUESTS_PER_MINUTE = 5;
setInterval(() => { requestCount = 0; }, 60000); // Reset every minute

// License constants
const LICENSE_KEY_PREFIX = 'GI';
const LICENSE_PRODUCT_ID = 'grok-integration';
const DEMO_LICENSE_KEY = 'GI-DEMO-KEY-12345678'; // For demo mode

// segment2-license.ts

// Helper: Get stored license key from configuration
function getLicenseKey(): string | undefined {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  return config.get<string>('licenseKey');
}

// Helper: Store license key in configuration
async function storeLicenseKey(licenseKey: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  await config.update('licenseKey', licenseKey, vscode.ConfigurationTarget.Global);
}

// Generate license key (securely using SecretStorage)
async function generateLicenseKey(email: string, context: vscode.ExtensionContext): Promise<string> {
  let secret = await context.secrets.get('grokSecret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex'); // Generate if not set
    await context.secrets.store('grokSecret', secret);
  }
  const data = `${email}-${LICENSE_PRODUCT_ID}`;
  const hmac = crypto.createHmac('sha256', secret);
  const hash = hmac.update(data).digest('hex');
  const segments = [hash.substring(0, 8), hash.substring(8, 16), hash.substring(16, 24)];
  return `${LICENSE_KEY_PREFIX}-${segments.join('-').toUpperCase()}`;
}

// Validate license key
async function validateLicenseKey(licenseKey: string): Promise<boolean> {
  if (!licenseKey || !licenseKey.startsWith(LICENSE_KEY_PREFIX + '-')) {
    return false;
  }
  const keyPattern = new RegExp(`^${LICENSE_KEY_PREFIX}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$`, 'i');
  if (!keyPattern.test(licenseKey)) return false;
  
  // TODO: Add server-side validation if needed (e.g., check against a database)
  return true; // For now, assume format match is valid
}

// Check license status and handle demo mode
async function checkLicenseStatus(context: vscode.ExtensionContext): Promise<boolean> {
  let licenseKey = getLicenseKey();
  if (!licenseKey) {
    licenseKey = DEMO_LICENSE_KEY;
    await storeLicenseKey(licenseKey);
    vscode.window.showInformationMessage('Demo mode activated. Limited features available.');
  }
  const isValid = await validateLicenseKey(licenseKey);
  if (!isValid) {
    vscode.window.showErrorMessage('Invalid license key. Please enter a valid one.');
  }
  return isValid;
}

// Prompt user for license key
async function promptForLicenseKey(context: vscode.Extension.Context): Promise<void> {
  const email = await vscode.window.showInputBox({ prompt: 'Enter your email for license generation' });
  if (!email) return;
  const licenseKey = await generateLicenseKey(email, context);
  await storeLicenseKey(licenseKey);
  vscode.window.showInformationMessage(`License key generated: ${licenseKey}`);
}

// Command to enter license key manually
async function enterLicenseKeyCommand(): Promise<void> {
  const licenseKey = await vscode.window.showInputBox({ prompt: 'Enter your Grok Integration license key' });
  if (licenseKey && await validateLicenseKey(licenseKey)) {
    await storeLicenseKey(licenseKey);
    vscode.window.showInformationMessage('License key validated and stored.');
  } else {
    vscode.window.showErrorMessage('Invalid license key.');
  }
}
// segment3-helpers.ts

// Redact potential secrets from text
function redactSecrets(text: string): string {
  return text.replace(/(api_key|password|secret|token|jwt|bearer|env)=[^& \n]+/gi, '$1=REDACTED');
}

// Estimate token count using gpt-tokenizer
function estimateTokens(text: string): number {
  const tokens = encode(text);
  return tokens.length;
}

// Get basic workspace context (limited to avoid data exposure)
async function getWorkspaceContext(): Promise<string> {
  const workspaceName = vscode.workspace.name || 'Untitled';
  const activeFile = vscode.window.activeTextEditor?.document.fileName || 'No active file';
  // TODO: Add more context if needed, but keep it minimal
  return `Workspace: ${workspaceName}\nActive File: ${activeFile}`;
}

// Get loading HTML for webview with script for updates
function getLoadingHTML(): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family);">
      <div id="content">🔍 Connecting to Grok... Please wait.</div>
      <script>
        (function() {
          const vscode = acquireVsCodeApi();
          window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
              document.getElementById('content').innerHTML += message.content;
            } else if (message.type === 'complete') {
              document.getElementById('content').innerHTML = message.html;
            }
          });
        })();
      </script>
    </body>
    </html>
  `;
}

// Convert markdown to sanitized HTML (for responses)
function convertMarkdownToHtml(markdown: string): string {
  // Simple markdown to HTML (use a library like marked if needed)
  let html = markdown.replace(/\n/g, '<br>').replace(/```(\w+)?\n([\s\S]*?)\n```/g, '<pre><code>$2</code></pre>');
  return DOMPurify.sanitize(html); // Sanitize to prevent XSS
}

// segment4-api.ts

// Test Grok API connection
async function testGrokConnection(apiKey: string): Promise<boolean> {
  try {
    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
    await openai.models.list(); // Simple test call
    return true;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}

// Process Grok request with streaming and webview updates
async function processGrokRequest(panel: vscode.WebviewPanel, code: string, language: string, action: string, apiKey: string): Promise<void> {
  const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
  const redactedCode = redactSecrets(code);
  const prompt = `As Grok, ${action} this ${language} code:\n\n${redactedCode}`;

  const tokenCount = estimateTokens(prompt);
  if (tokenCount > 8000) { // Approximate Grok limit
    panel.webview.postMessage({ type: 'complete', html: '<p>⚠️ Prompt too long (estimated ' + tokenCount + ' tokens). Shorten your selection.</p>' });
    return;
  }

  try {
    const stream = await openai.chat.completions.create({
      model: 'grok-beta',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullResponse += content;
      panel.webview.postMessage({ type: 'update', content: convertMarkdownToHtml(content) });
    }
    panel.webview.postMessage({ type: 'complete', html: convertMarkdownToHtml(fullResponse) });
  } catch (error) {
    panel.webview.postMessage({ type: 'complete', html: '<p>❌ Error: ' + (error as Error).message + '</p>' });
  }
}

// Show Grok webview panel
async function showGrokPanel(context: vscode.ExtensionContext, title: string, code: string, language: string, action: string): Promise<void> {
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    vscode.window.showErrorMessage('Rate limit exceeded. Please wait a minute.');
    return;
  }
  requestCount++;

  const consent = await vscode.window.showInformationMessage('Send selected code to xAI API?', 'Yes', 'No');
  if (consent !== 'Yes') return;

  const config = vscode.workspace.getConfiguration('grokIntegration');
  const apiKey = config.get<string>('apiKey');
  if (!apiKey) {
    const newKey = await vscode.window.showInputBox({ prompt: 'Enter your xAI API key' });
    if (newKey) {
      await config.update('apiKey', newKey, vscode.ConfigurationTarget.Global);
    } else {
      return;
    }
  }

  if (!(await checkLicenseStatus(context))) return;

  const panel = vscode.window.createWebviewPanel('grokResponse', title, vscode.ViewColumn.Beside, { enableScripts: true });
  panel.webview.html = getLoadingHTML();
  await processGrokRequest(panel, code, language, action, apiKey!);
}

// segment5-chat.ts

class GrokChatParticipant implements vscode.ChatParticipant {
  id = 'grok.chatParticipant';
  displayName = 'Grok AI';
  iconPath = vscode.Uri.parse('https://example.com/grok-icon.png'); // TODO: Replace with actual icon URI or use vscode.Uri.file for local

  async prepareRequest(request: vscode.ChatRequest, token: vscode.CancellationToken): Promise<void> {
    // Optional: Pre-process request (e.g., check license)
  }

  async handleRequest(request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<void> {
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const apiKey = config.get<string>('apiKey');
    if (!apiKey) {
      stream.markdown('Please set your xAI API key in settings.');
      return;
    }

    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });

    // Handle slash commands
    let action = 'respond to';
    if (request.command === 'explain') action = 'explain';
    else if (request.command === 'review') action = 'review and suggest improvements for';
    else if (request.command === 'debug') action = 'debug';

    // Get selected code or context
    const editor = vscode.window.activeTextEditor;
    const code = editor ? editor.document.getText(editor.selection) : '';
    const language = editor ? editor.document.languageId : 'plaintext';
    const redactedCode = redactSecrets(code);
    const workspaceContext = await getWorkspaceContext();
    const userPrompt = request.prompt || 'Hello';

    const fullPrompt = `As Grok, ${action} this: ${userPrompt}\n\nCode (if any): ${redactedCode}\nLanguage: ${language}\nContext: ${workspaceContext}`;

    // Token check
    const tokenCount = estimateTokens(fullPrompt);
    if (tokenCount > 8000) {
      stream.markdown(`⚠️ Prompt too long (${tokenCount} tokens). Please shorten it.`);
      return;
    }

    // Stream response
    try {
      const response = await openai.chat.completions.create({
        model: 'grok-beta',
        messages: [{ role: 'user', content: fullPrompt }],
        stream: true,
      });

      let fullResponse = '';
      for await (const chunk of response) {
        if (token.isCancellationRequested) return;
        const content = chunk.choices[0]?.delta?.content || '';
        fullResponse += content;
        stream.markdown(content); // Stream to chat
      }

      // Add follow-up suggestions
      stream.button({ command: 'grok.moreDetails', title: 'More Details' });
      stream.button({ command: 'grok.generateTests', title: 'Generate Tests' });
      stream.button({ command: 'grok.refactor', title: 'Refactor Code' });
    } catch (error) {
      stream.markdown(`❌ Error: ${(error as Error).message}`);
    }
  }
}

// Register chat participant
function registerChatParticipant(context: vscode.ExtensionContext) {
  const participant = vscode.chat.registerChatParticipant('grok.chat', new GrokChatParticipant());
  context.subscriptions.push(participant);

  // Define slash commands
  participant.registerSlashCommand('explain', 'Explain selected code');
  participant.registerSlashCommand('review', 'Review code for issues');
  participant.registerSlashCommand('debug', 'Debug code');
}

// segment6-commands.ts

// Command: Ask Grok (basic query with selected code)
async function askGrokCommand(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const code = editor.document.getText(editor.selection);
  const language = editor.document.languageId;
  await showGrokPanel(context, 'Grok Response', code, language, 'analyze');
}

// Command: Explain selected code (context menu)
async function explainCodeCommand(context: vscode.Extension.Context): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const code = editor.document.getText(editor.selection);
  const language = editor.document.languageId;
  await showGrokPanel(context, 'Grok Explanation', code, language, 'explain');
}

// Command: Review selected code (context menu)
async function reviewCodeCommand(context: vscode.Extension.Context): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const code = editor.document.getText(editor.selection);
  const language = editor.document.languageId;
  await showGrokPanel(context, 'Grok Review', code, language, 'review and suggest improvements for');
}

// Inline chat command (ask Grok in editor)
async function askGrokInlineCommand(): Promise<void> {
  // TODO: Implement inline provider if needed (using vscode.InlineCompletionItemProvider)
  vscode.window.showInformationMessage('Inline chat: Ask Grok (feature in beta)');
}

// Edit with Grok command
async function editWithGrokCommand(): Promise<void> {
  // TODO: Use vscode.workspace.edit for AI-assisted edits
  vscode.window.showInformationMessage('Edit with Grok (feature in beta)');
}

// Debug test command
async function debugTestCommand(): Promise<void> {
  console.log('Debug test triggered');
  vscode.window.showInformationMessage('Debug test successful');
}

// Test connection command
async function testConnectionCommand(): Promise<void> {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const apiKey = config.get<string>('apiKey');
  if (await testGrokConnection(apiKey!)) {
    vscode.window.showInformationMessage('Connection to Grok API successful!');
  } else {
    vscode.window.showErrorMessage('Connection failed. Check API key.');
  }
}

// segment7-upload-token.ts

// Command: Upload files (preview and basic upload to API)
async function uploadFilesCommand(): Promise<void> {
  const files = await vscode.window.showOpenDialog({ canSelectMany: true, canSelectFolders: false });
  if (!files) return;

  let content = '';
  for (const file of files) {
    const fileContent = fs.readFileSync(file.fsPath, 'utf8');
    content += `File: ${path.basename(file.fsPath)}\n${fileContent}\n\n`;
  }

  // Preview (TODO: Integrate actual upload to Grok API if endpoint supports)
  const preview = await vscode.window.showInformationMessage('File contents preview:\n' + content.substring(0, 200) + '...', 'Upload', 'Cancel');
  if (preview === 'Upload') {
    // Placeholder: Send to API (adapt processGrokRequest)
    vscode.window.showInformationMessage('Files uploaded to Grok (simulated).');
  }
}

// Command: Show token count for selection
async function showTokenCountCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const text = editor.document.getText(editor.selection);
  const tokenCount = estimateTokens(text);
  vscode.window.showInformationMessage(`Estimated tokens: ${tokenCount}`);
}
// segment8-activation.ts

export async function activate(context: vscode.ExtensionContext) {
  // Check license on activation
  await checkLicenseStatus(context);

  // Register chat participant
  registerChatParticipant(context);

  // Register commands
  const commands = [
    vscode.commands.registerCommand('grok.askGrok', () => askGrokCommand(context)),
    vscode.commands.registerCommand('grok.explainCode', () => explainCodeCommand(context)),
    vscode.commands.registerCommand('grok.reviewCode', () => reviewCodeCommand(context)),
    vscode.commands.registerCommand('grok.askGrokInline', askGrokInlineCommand),
    vscode.commands.registerCommand('grok.editWithGrok', editWithGrokCommand),
    vscode.commands.registerCommand('grok.enterLicenseKey', enterLicenseKeyCommand),
    vscode.commands.registerCommand('grok.checkLicense', () => checkLicenseStatus(context)),
    vscode.commands.registerCommand('grok.purchaseLicense', () => vscode.env.openExternal(vscode.Uri.parse('https://example.com/purchase'))), // TODO: Real URL
    vscode.commands.registerCommand('grok.uploadFiles', uploadFilesCommand),
    vscode.commands.registerCommand('grok.showTokenCount', showTokenCountCommand),
    vscode.commands.registerCommand('grok.debugTest', debugTestCommand),
    vscode.commands.registerCommand('grok.testConnection', testConnectionCommand),
  ];

  // Register context menu items
  context.subscriptions.push(
    vscode.commands.registerCommand('grok.explainCodeContext', () => explainCodeCommand(context)),
    vscode.commands.registerCommand('grok.reviewCodeContext', () => reviewCodeCommand(context))
  );

  // Push all to subscriptions
  commands.forEach(cmd => context.subscriptions.push(cmd));

  console.log('Grok Integration extension activated!');
}

export function deactivate() {
  // Cleanup (e.g., clear globals or storage if needed)
  console.log('Grok Integration extension deactivated.');
}