import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { encode } from 'gpt-tokenizer'; // For token estimation

const window = new JSDOM('').window;
const purify = createDOMPurify(window as any);

// Logging setup
let logFilePath: string | undefined;
let logStream: fs.WriteStream | undefined;

function initializeLogging(context: vscode.ExtensionContext) {
  try {
    logFilePath = path.join(context.extensionPath, 'grok-debug.log');
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    logToFile('=== GROK EXTENSION STARTUP ===', new Date().toISOString());
    logToFile('Extension Path:', context.extensionPath);
    logToFile('VS Code Version:', vscode.version);
  } catch (error) {
    console.error('Failed to initialize logging:', error);
  }
}

function logToFile(message: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message} ${args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ')}\n`;
  
  // Log to console AND file
  console.log(logMessage.trim());
  
  if (logStream) {
    logStream.write(logMessage);
  }
}

// Rate limiting: Simple in-memory counter (reset every minute)
let requestCount = 0;
const MAX_REQUESTS_PER_MINUTE = 30; // Increased from 5 to 30
setInterval(() => { requestCount = 0; }, 60000); // Reset every minute

// License constants
const LICENSE_KEY_PREFIX = 'GI';
const LICENSE_PRODUCT_ID = 'grok-integration';
const DEMO_LICENSE_KEY = 'GI-DEMO1234-ABCD5678-EFGH9012'; // Match package.json default

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
  if (licenseKey === DEMO_LICENSE_KEY) return true;
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
  logToFile('🔐 Checking license status...');
  let licenseKey = getLicenseKey();
  logToFile('Current license key:', licenseKey ? 'EXISTS' : 'NOT_SET');
  
  if (!licenseKey) {
    licenseKey = DEMO_LICENSE_KEY;
    await storeLicenseKey(licenseKey);
    logToFile('✅ Demo license activated:', licenseKey);
    vscode.window.showInformationMessage('Demo mode activated. Limited features available.');
  }
  
  const isValid = await validateLicenseKey(licenseKey);
  logToFile('License validation result:', isValid);
  
  if (!isValid) {
    logToFile('❌ Invalid license key detected');
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
  return purify.sanitize(html); // Sanitize to prevent XSS
}

// segment4-api.ts

// Test Grok API connection
async function testGrokConnection(apiKey: string): Promise<boolean> {
  logToFile('🔗 Testing Grok API connection...');
  try {
    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 30000 });
    logToFile('OpenAI client created, making test request...');
    
    const response = await openai.chat.completions.create({
      model: 'grok-4-latest',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 3,
      temperature: 0.1
    });
    
    logToFile('API response received:', response.choices && response.choices.length > 0);
    return response.choices && response.choices.length > 0;
  } catch (error) {
    logToFile('❌ Connection test failed:', error);
    return false;
  }
}

// Process Grok request with streaming and webview updates
async function processGrokRequest(panel: vscode.WebviewPanel, code: string, language: string, action: string, apiKey: string): Promise<void> {
  logToFile('🔄 processGrokRequest started');
  
  try {
    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 60000 });
    const redactedCode = redactSecrets(code);
    const prompt = `As Grok, ${action} this ${language} code:\n\n${redactedCode}`;

    logToFile('📏 Prompt created, checking token count...');
    const tokenCount = estimateTokens(prompt);
    logToFile('Token count:', tokenCount);
    
    if (tokenCount > 8000) { // Approximate Grok limit
      logToFile('❌ Prompt too long');
      panel.webview.postMessage({ type: 'complete', html: '<p>⚠️ Prompt too long (estimated ' + tokenCount + ' tokens). Shorten your selection.</p>' });
      return;
    }

    logToFile('🚀 Making API request to Grok...');
    const stream = await openai.chat.completions.create({
      model: 'grok-4-latest',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 9000,
      temperature: 0.5,
      stream: true,
    });

    logToFile('📡 Streaming response...');
    let fullResponse = '';
    let chunkCount = 0;
    
    for await (const chunk of stream) {
      chunkCount++;
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        panel.webview.postMessage({ type: 'update', content: purify.sanitize(content.replace(/\n/g, '<br>')) }); // Basic streaming fix: sanitize partial, replace newlines
      }
    }
    
    logToFile('✅ Streaming completed. Chunks received:', chunkCount, 'Response length:', fullResponse.length);
    panel.webview.postMessage({ type: 'complete', html: convertMarkdownToHtml(fullResponse) });
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logToFile('❌ processGrokRequest error:', errorMsg);
    panel.webview.postMessage({ type: 'complete', html: '<p>❌ Error: ' + errorMsg + '</p>' });
  }
}

// Show Grok webview panel
async function showGrokPanel(context: vscode.ExtensionContext, title: string, code: string, language: string, action: string): Promise<void> {
  logToFile('🎯 showGrokPanel called:', title, 'Code length:', code.length);
  
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    logToFile('❌ Rate limit exceeded');
    vscode.window.showErrorMessage('Rate limit exceeded. Please wait a minute.');
    return;
  }
  requestCount++;

  const consent = await vscode.window.showInformationMessage('Send selected code to xAI API?', 'Yes', 'No');
  if (consent !== 'Yes') {
    logToFile('❌ User declined consent');
    return;
  }

  const config = vscode.workspace.getConfiguration('grokIntegration');
  let apiKey = config.get<string>('apiKey');
  
  if (!apiKey) {
    logToFile('❌ No API key found, prompting user...');
    const newKey = await vscode.window.showInputBox({ 
      prompt: 'Enter your xAI API key',
      password: true,
      placeHolder: 'xai-...'
    });
    if (newKey) {
      await config.update('apiKey', newKey, vscode.ConfigurationTarget.Global);
      apiKey = newKey;
      logToFile('✅ API key saved');
    } else {
      logToFile('❌ No API key provided');
      return;
    }
  }

  if (!(await checkLicenseStatus(context))) {
    logToFile('❌ License check failed');
    return;
  }

  logToFile('✅ Creating webview panel...');
  const panel = vscode.window.createWebviewPanel('grokResponse', title, vscode.ViewColumn.Beside, { enableScripts: true });
  panel.webview.html = getLoadingHTML();
  
  logToFile('🚀 Starting Grok request...');
  await processGrokRequest(panel, code, language, action, apiKey);
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
  id = 'grok-integration.grok';
  displayName = 'Grok AI';
  iconPath = new vscode.ThemeIcon('hubot'); // Use a valid ThemeIcon

  async prepareRequest(request: vscode.ChatRequest, token: vscode.CancellationToken): Promise<void> {
    // Optional: Pre-process request (e.g., check license)
  }

  async handleRequest(request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<void> {
    logToFile('💬 Chat participant handleRequest called');
    logToFile('Request prompt:', request.prompt);
    logToFile('Request command:', request.command);
    
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const apiKey = config.get<string>('apiKey');
    
    if (!apiKey) {
      logToFile('❌ No API key found');
      stream.markdown('❌ **API Key Required**: Please set your xAI API key in settings.\n\n[Open Settings](command:workbench.action.openSettings?%5B%22grokIntegration.apiKey%22%5D)');
      return;
    }

    logToFile('✅ API key found, creating OpenAI client...');
    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 60000 });

    // Handle slash commands
    let action = 'respond to';
    if (request.command === 'explain') action = 'explain';
    else if (request.command === 'review') action = 'review and suggest improvements for';
    else if (request.command === 'debug') action = 'debug';

    logToFile('Action determined:', action);

    // Get selected code or context
    const editor = vscode.window.activeTextEditor;
    const code = editor ? editor.document.getText(editor.selection) : '';
    const language = editor ? editor.document.languageId : 'plaintext';
    const redactedCode = redactSecrets(code);
    const workspaceContext = await getWorkspaceContext();
    const userPrompt = request.prompt || 'Hello';

    logToFile('Context gathered - Code length:', code.length, 'Language:', language);

    const fullPrompt = `As Grok, ${action} this: ${userPrompt}\n\nCode (if any): ${redactedCode}\nLanguage: ${language}\nContext: ${workspaceContext}`;

    // Token check
    const tokenCount = estimateTokens(fullPrompt);
    logToFile('Token count estimated:', tokenCount);
    
    if (tokenCount > 8000) {
      logToFile('❌ Prompt too long, rejecting');
      stream.markdown(`⚠️ Prompt too long (${tokenCount} tokens). Please shorten it.`);
      return;
    }

    // Stream response
    try {
      logToFile('🚀 Starting Grok API request...');
      stream.progress('🔍 Connecting to Grok...');
      
      const response = await openai.chat.completions.create({
        model: 'grok-4-latest',
        messages: [{ role: 'user', content: fullPrompt }],
        max_tokens: 9000,
        temperature: 0.5,
        stream: true,
      });

      logToFile('📡 Streaming response started...');
      let fullResponse = '';
      let hasContent = false;
      
      for await (const chunk of response) {
        if (token.isCancellationRequested) {
          logToFile('⏹️ Request cancelled by user');
          return;
        }
        
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          if (!hasContent) {
            logToFile('📝 First content received, starting stream...');
            stream.progress('📝 Receiving response...');
            hasContent = true;
          }
          fullResponse += content;
          stream.markdown(content); // Stream to chat
        }
      }

      logToFile('✅ Streaming completed. Total response length:', fullResponse.length);

      if (!hasContent) {
        logToFile('⚠️ No content received from Grok');
        stream.markdown('⚠️ No response received from Grok. Please try again.');
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logToFile('❌ Chat request error:', errorMsg, error);
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
  logToFile('📖 explainCodeCommand called');
  
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      logToFile('❌ No active editor');
      vscode.window.showErrorMessage('No active editor found.');
      return;
    }

    const code = editor.document.getText(editor.selection);
    const language = editor.document.languageId;
    
    logToFile('Code selected - Length:', code.length, 'Language:', language);
    
    if (!code.trim()) {
      logToFile('❌ No code selected');
      vscode.window.showErrorMessage('Please select code to explain.');
      return;
    }

    await showGrokPanel(context, 'Grok Explanation', code, language, 'explain');
  } catch (error) {
    logToFile('❌ explainCodeCommand error:', error);
    vscode.window.showErrorMessage(`Error in explain command: ${error}`);
  }
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
  // Initialize logging FIRST
  initializeLogging(context);
  logToFile('🚀 Grok Integration: Starting activation...');
  
  try {
    // Check license on activation
    logToFile('🔐 Starting license check...');
    const isLicensed = await checkLicenseStatus(context);
    if (!isLicensed) {
      logToFile('❌ License check failed during activation');
    } else {
      logToFile('✅ License check passed');
    }

    // Register chat participant with correct ID and proper configuration
    logToFile('📝 Registering chat participant...');
    const grokParticipant = new GrokChatParticipant();
    const participant = vscode.chat.createChatParticipant('grok-integration.grok', grokParticipant.requestHandler);
    
    // Configure participant properties
    participant.iconPath = new vscode.ThemeIcon('hubot');
    participant.followupProvider = {
      provideFollowups(result: vscode.ChatResult, context: vscode.ChatContext, token: vscode.CancellationToken) {
        logToFile('📋 Providing followups...');
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
    logToFile('✅ Chat participant registered successfully');

    // Register commands with correct IDs matching package.json
    logToFile('🔧 Registering commands...');
    const commands = [
      vscode.commands.registerCommand('grok-integration.askGrok', () => {
        logToFile('🌀 askGrok command triggered');
        return askGrokCommand(context);
      }),
      vscode.commands.registerCommand('grok-integration.explainCode', () => {
        logToFile('📖 explainCode command triggered');
        return explainCodeCommand(context);
      }),
      vscode.commands.registerCommand('grok-integration.reviewCode', () => {
        logToFile('🔍 reviewCode command triggered');
        return reviewCodeCommand(context);
      }),
      vscode.commands.registerCommand('grok-integration.askGrokInline', () => {
        logToFile('💬 askGrokInline command triggered');
        return askGrokInlineCommand();
      }),
      vscode.commands.registerCommand('grok-integration.editWithGrok', () => {
        logToFile('✏️ editWithGrok command triggered');
        return editWithGrokCommand();
      }),
      vscode.commands.registerCommand('grok-integration.enterLicenseKey', () => {
        logToFile('🔑 enterLicenseKey command triggered');
        return enterLicenseKeyCommand();
      }),
      vscode.commands.registerCommand('grok-integration.checkLicense', () => {
        logToFile('✅ checkLicense command triggered');
        return checkLicenseStatus(context);
      }),
      vscode.commands.registerCommand('grok-integration.purchaseLicense', () => {
        logToFile('💳 purchaseLicense command triggered');
        return vscode.env.openExternal(vscode.Uri.parse('https://example.com/purchase'));
      }),
      vscode.commands.registerCommand('grok-integration.uploadFiles', () => {
        logToFile('📂 uploadFiles command triggered');
        return uploadFilesCommand();
      }),
      vscode.commands.registerCommand('grok-integration.showTokenCount', () => {
        logToFile('🔢 showTokenCount command triggered');
        return showTokenCountCommand();
      }),
      vscode.commands.registerCommand('grok-integration.debugTest', () => {
        logToFile('🔧 debugTest command triggered');
        return debugTestCommand();
      }),
      vscode.commands.registerCommand('grok-integration.testConnection', () => {
        logToFile('🔗 testConnection command triggered');
        return testConnectionCommand();
      }),
      vscode.commands.registerCommand('grok-integration.securityFix', () => {
        logToFile('🛡️ securityFix command triggered');
        return securityFixCommand(context);
      })
    ];

    // Register context menu items with correct IDs
    logToFile('📋 Registering context menu items...');
    context.subscriptions.push(
      vscode.commands.registerCommand('grok-integration.explainCodeContext', () => {
        logToFile('📖 explainCodeContext command triggered');
        return explainCodeCommand(context);
      }),
      vscode.commands.registerCommand('grok-integration.reviewCodeContext', () => {
        logToFile('🔍 reviewCodeContext command triggered');
        return reviewCodeCommand(context);
      })
    );

    // Push all to subscriptions
    commands.forEach(cmd => context.subscriptions.push(cmd));
    logToFile('📝 Commands added to subscriptions. Total subscriptions:', context.subscriptions.length);

    logToFile('✅ All commands registered successfully');
    logToFile('🎉 Grok Integration extension activated successfully!');
    
    // Show success message
    vscode.window.showInformationMessage('🤖 Grok Integration activated! Try @grok in chat or right-click selected code.');
    
  } catch (error) {
    logToFile('❌ Extension activation failed:', error);
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
  console.log('🛑 Grok Integration extension deactivating...');
  
  // Close log stream safely
  if (logStream) {
    try {
      logStream.end();
      logStream = undefined;
    } catch (error) {
      console.error('Error closing log stream:', error);
    }
  }
  
  console.log('✅ Grok Integration extension deactivated successfully.');
}