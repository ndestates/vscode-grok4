import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import DOMPurify from 'dompurify'; // For sanitizing HTML
import { encode } from 'gpt-tokenizer'; // For token estimation

// Rate limiting: Simple in-memory counter (reset every minute)
let requestCount = 0;
const MAX_REQUESTS_PER_MINUTE = 30; // Increased from 5 to 30
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
async function promptForLicenseKey(context: vscode.ExtensionContext): Promise<void> {
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
    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 30000 });
    const response = await openai.chat.completions.create({
      model: 'grok-2-1212',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 3,
      temperature: 0.1
    });
    return response.choices && response.choices.length > 0;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}

// Process Grok request with streaming and webview updates
async function processGrokRequest(panel: vscode.WebviewPanel, code: string, language: string, action: string, apiKey: string): Promise<void> {
  const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 60000 });
  const redactedCode = redactSecrets(code);
  const prompt = `As Grok, ${action} this ${language} code:\n\n${redactedCode}`;

  const tokenCount = estimateTokens(prompt);
  if (tokenCount > 8000) { // Approximate Grok limit
    panel.webview.postMessage({ type: 'complete', html: '<p>⚠️ Prompt too long (estimated ' + tokenCount + ' tokens). Shorten your selection.</p>' });
    return;
  }

  try {
    const stream = await openai.chat.completions.create({
      model: 'grok-4-0709',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.7,
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
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    panel.webview.postMessage({ type: 'complete', html: '<p>❌ Error: ' + errorMsg + '</p>' });
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
  // Handles incoming chat requests
  requestHandler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
    await this.handleRequest(request, stream, token);
  };

  // Optional: Handles feedback from chat results
  private _onDidReceiveFeedbackEmitter = new vscode.EventEmitter<vscode.ChatResultFeedback>();
  onDidReceiveFeedback: vscode.Event<vscode.ChatResultFeedback> = this._onDidReceiveFeedbackEmitter.event;
  followupProvider?: vscode.ChatFollowupProvider | undefined;
  dispose(): void {
    this._onDidReceiveFeedbackEmitter.dispose();
  }
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
      stream.markdown('❌ **API Key Required**: Please set your xAI API key in settings.\n\n[Open Settings](command:workbench.action.openSettings?%5B%22grokIntegration.apiKey%22%5D)');
      return;
    }

    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 60000 });

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
      stream.progress('🔍 Connecting to Grok...');
      
      const response = await openai.chat.completions.create({
        model: 'grok-2-1212',
        messages: [{ role: 'user', content: fullPrompt }],
        max_tokens: 2000,
        temperature: 0.7,
        stream: true,
      });

      let fullResponse = '';
      let hasContent = false;
      
      for await (const chunk of response) {
        if (token.isCancellationRequested) return;
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          if (!hasContent) {
            stream.progress('📝 Receiving response...');
            hasContent = true;
          }
          fullResponse += content;
          stream.markdown(content); // Stream to chat
        }
      }

      if (!hasContent) {
        stream.markdown('⚠️ No response received from Grok. Please try again.');
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      stream.markdown(`❌ **Error**: ${errorMsg}\n\nPlease check your API key and try again.`);
    }
  }
}

// Register chat participant
function registerChatParticipant(context: vscode.ExtensionContext) {
  const grokParticipant = new GrokChatParticipant();
  const participant = vscode.chat.createChatParticipant('grok-integration.grok', grokParticipant.requestHandler);
  context.subscriptions.push(participant);
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
async function explainCodeCommand(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const code = editor.document.getText(editor.selection);
  const language = editor.document.languageId;
  await showGrokPanel(context, 'Grok Explanation', code, language, 'explain');
}

// Command: Review selected code (context menu)
async function reviewCodeCommand(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const code = editor.document.getText(editor.selection);
  const language = editor.document.languageId;
  await showGrokPanel(context, 'Grok Review', code, language, 'review and suggest improvements for');
}

// Inline chat command (ask Grok in editor)
async function askGrokInlineCommand(): Promise<void> {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const apiKey = config.get<string>('apiKey');
  if (!apiKey) {
    const action = await vscode.window.showErrorMessage(
      '🔑 xAI API Key Required',
      'Open Settings',
      'Get API Key'
    );
    if (action === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
    } else if (action === 'Get API Key') {
      vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/'));
    }
    return;
  }
  
  await vscode.commands.executeCommand('workbench.action.chat.open');
  await vscode.commands.executeCommand('workbench.action.chat.insertAtCursor', '@grok ');
}

// Edit with Grok command
async function editWithGrokCommand(): Promise<void> {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const apiKey = config.get<string>('apiKey');
  if (!apiKey) {
    const action = await vscode.window.showErrorMessage(
      '🔑 xAI API Key Required',
      'Open Settings',
      'Get API Key'
    );
    if (action === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
    } else if (action === 'Get API Key') {
      vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/'));
    }
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

// Debug test command
async function debugTestCommand(): Promise<void> {
  console.log('Debug test triggered');
  vscode.window.showInformationMessage('Debug test successful');
}

// Test connection command
async function testConnectionCommand(): Promise<void> {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const apiKey = config.get<string>('apiKey');
  
  if (!apiKey) {
    const action = await vscode.window.showErrorMessage(
      '🔑 API Key Required',
      'Open Settings',
      'Get API Key'
    );
    if (action === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
    } else if (action === 'Get API Key') {
      vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/'));
    }
    return;
  }

  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Testing Grok API Connection...",
    cancellable: false
  }, async (progress) => {
    progress.report({ increment: 20, message: "Connecting..." });
    
    const success = await testGrokConnection(apiKey);
    
    progress.report({ increment: 80, message: "Verifying response..." });
    
    if (success) {
      vscode.window.showInformationMessage('✅ Grok API Connection Successful! Ready to use @grok in chat.');
    } else {
      const action = await vscode.window.showErrorMessage(
        '❌ Connection Failed: Please check your API key',
        'Check API Key',
        'Get Help'
      );
      
      if (action === 'Check API Key') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
      } else if (action === 'Get Help') {
        vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/docs'));
      }
    }
  });
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
  console.log('🚀 Grok Integration: Starting activation...');
  
  try {
    // Check license on activation
    const isLicensed = await checkLicenseStatus(context);
    if (!isLicensed) {
      console.log('❌ License check failed during activation');
    }

    // Register chat participant with correct ID and proper configuration
    console.log('📝 Registering chat participant...');
    const grokParticipant = new GrokChatParticipant();
    const participant = vscode.chat.createChatParticipant('grok-integration.grok', grokParticipant.requestHandler);
    
    // Configure participant properties
    participant.iconPath = new vscode.ThemeIcon('robot');
    participant.followupProvider = {
      provideFollowups(result: vscode.ChatResult, context: vscode.ChatContext, token: vscode.CancellationToken) {
        return [
          {
            prompt: 'Explain this in more detail',
            label: '🔍 More details',
            command: 'explain'
          },
          {
            prompt: 'Show me an example',
            label: '💡 Show example'
          },
          {
            prompt: 'How can I improve this code?',
            label: '⚡ Improve code',
            command: 'review'
          }
        ];
      }
    };
    
    context.subscriptions.push(participant);
    console.log('✅ Chat participant registered successfully');

    // Register commands with correct IDs matching package.json
    console.log('🔧 Registering commands...');
    const commands = [
      vscode.commands.registerCommand('grok-integration.askGrok', () => askGrokCommand(context)),
      vscode.commands.registerCommand('grok-integration.explainCode', () => explainCodeCommand(context)),
      vscode.commands.registerCommand('grok-integration.reviewCode', () => reviewCodeCommand(context)),
      vscode.commands.registerCommand('grok-integration.askGrokInline', askGrokInlineCommand),
      vscode.commands.registerCommand('grok-integration.editWithGrok', editWithGrokCommand),
      vscode.commands.registerCommand('grok-integration.enterLicenseKey', enterLicenseKeyCommand),
      vscode.commands.registerCommand('grok-integration.checkLicense', () => checkLicenseStatus(context)),
      vscode.commands.registerCommand('grok-integration.purchaseLicense', () => vscode.env.openExternal(vscode.Uri.parse('https://example.com/purchase'))),
      vscode.commands.registerCommand('grok-integration.uploadFiles', uploadFilesCommand),
      vscode.commands.registerCommand('grok-integration.showTokenCount', showTokenCountCommand),
      vscode.commands.registerCommand('grok-integration.debugTest', debugTestCommand),
      vscode.commands.registerCommand('grok-integration.testConnection', testConnectionCommand),
      vscode.commands.registerCommand('grok-integration.securityFix', () => securityFixCommand(context))
    ];

    // Register context menu items with correct IDs
    context.subscriptions.push(
      vscode.commands.registerCommand('grok-integration.explainCodeContext', () => explainCodeCommand(context)),
      vscode.commands.registerCommand('grok-integration.reviewCodeContext', () => reviewCodeCommand(context))
    );

    // Push all to subscriptions
    commands.forEach(cmd => context.subscriptions.push(cmd));

    console.log('✅ All commands registered successfully');
    console.log('🎉 Grok Integration extension activated successfully!');
    
    // Show success message
    vscode.window.showInformationMessage('🤖 Grok Integration activated! Try @grok in chat or right-click selected code.');
    
  } catch (error) {
    console.error('❌ Extension activation failed:', error);
    vscode.window.showErrorMessage(`Failed to activate Grok Integration: ${error}`);
  }
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

  if (!(await checkLicenseStatus(context))) return;

  const panel = vscode.window.createWebviewPanel(
    'grokSecurityFix',
    'Grok Security Fix',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );
  panel.webview.html = getLoadingHTML();

  // Use Grok to suggest security fixes for the selected code
  await processGrokRequest(panel, code, language, 'find and suggest security fixes for', apiKey);
}

export function deactivate() {
  // Cleanup (e.g., clear globals or storage if needed)
  console.log('Grok Integration extension deactivated.');
}
