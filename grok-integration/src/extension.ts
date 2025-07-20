import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';
import createDOMPurify from 'dompurify';
import { parseHTML } from 'linkedom';

// Lightweight DOM setup for DOMPurify
const { window } = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
const purify = createDOMPurify(window as any);

// Rate limiting: Simple in-memory counter (reset every minute)
let requestCount = 0;
const MAX_REQUESTS_PER_MINUTE = 30;
setInterval(() => { requestCount = 0; }, 60000);

// Helper functions

function redactSecrets(text: string): string {
  return text.replace(/(api_key|password|secret|token|jwt|bearer|env)=[^& \n]+/gi, '$1=REDACTED');
}

/**
 * Estimates the number of tokens in the given text using a simple heuristic.
 * This is approximate (not exact tokenization) and synchronous.
 * For English text, it's roughly accurate for models like GPT/Grok.
 * @param text The input string to estimate tokens for.
 * @returns Estimated token count (number).
 */
function estimateTokens(text: string): number {
  if (!text) return 0; // Handle empty input

  // Remove extra whitespace for a cleaner estimate
  const cleanedText = text.trim().replace(/\s+/g, ' ');

  // Heuristic: ~4 chars per token (adjust based on your model's avg if known)
  const charCount = cleanedText.length;
  const estimatedTokens = Math.ceil(charCount / 4); // Round up for safety

  // Add a small buffer for punctuation/subwords (e.g., +10% adjustment)
  return Math.ceil(estimatedTokens * 1.1);
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

// Keep this secure approach
// (window and purify already declared above)

function convertMarkdownToHtml(markdown: string): string {
  let html = markdown
    .replace(/\n/g, '<br>')
    .replace(/```(\w+)?\n([\s\S]*?)\n```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  return purify.sanitize(html); // This is the key security benefit
}

// API functions

async function testGrokConnection(apiKey: string): Promise<boolean> {
  try {
    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 30000 });
    
    const response = await openai.chat.completions.create({
      model: 'grok-4-latest',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 3,
      temperature: 0.1
    });
    
    return response.choices && response.choices.length > 0;
  } catch (error) {
    return false;
  }
}

async function processGrokRequest(panel: vscode.WebviewPanel, code: string, language: string, action: string, apiKey: string): Promise<void> {
  try {
    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 60000 });
    const redactedCode = redactSecrets(code);
    const prompt = `As Grok, ${action} this ${language} code:\n\n${redactedCode}`;

    const tokenCount = estimateTokens(prompt);
    
    if (tokenCount > 8000) {
      panel.webview.postMessage({ type: 'complete', html: '<p>⚠️ Prompt too long (estimated ' + tokenCount + ' tokens). Shorten your selection.</p>' });
      return;
    }

    const stream = await openai.chat.completions.create({
      model: 'grok-4-latest',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 9000,
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
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    panel.webview.postMessage({ type: 'complete', html: '<p>❌ Error: ' + errorMsg + '</p>' });
  }
}

async function showGrokPanel(context: vscode.ExtensionContext, title: string, code: string, language: string, action: string): Promise<void> {
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    vscode.window.showErrorMessage('Rate limit exceeded. Please wait a minute.');
    return;
  }
  requestCount++;

  const consent = await vscode.window.showInformationMessage('Send selected code to xAI API?', 'Yes', 'No');
  if (consent !== 'Yes') {
    return;
  }

  const config = vscode.workspace.getConfiguration('grokIntegration');
  let apiKey = config.get<string>('apiKey');
  
  if (!apiKey) {
    const newKey = await vscode.window.showInputBox({ 
      prompt: 'Enter your xAI API key',
      password: true,
      placeHolder: 'xai-...'
    });
    if (newKey) {
      await config.update('apiKey', newKey, vscode.ConfigurationTarget.Global);
      apiKey = newKey;
    } else {
      return;
    }
  }

  const panel = vscode.window.createWebviewPanel('grokResponse', title, vscode.ViewColumn.Beside, { enableScripts: true });
  panel.webview.html = getLoadingHTML();
  
  await processGrokRequest(panel, code, language, action, apiKey);
}

// Chat participant

class GrokChatParticipant implements vscode.ChatParticipant {
  requestHandler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
    await this.handleRequest(request, stream, token);
  };

  private _onDidReceiveFeedbackEmitter = new vscode.EventEmitter<vscode.ChatResultFeedback>();
  onDidReceiveFeedback: vscode.Event<vscode.ChatResultFeedback> = this._onDidReceiveFeedbackEmitter.event;
  followupProvider?: vscode.ChatFollowupProvider | undefined;
  dispose(): void {
    this._onDidReceiveFeedbackEmitter.dispose();
  }
  id = 'grok-integration.grok';
  displayName = 'Grok AI';
  iconPath = new vscode.ThemeIcon('hubot');

  async prepareRequest(request: vscode.ChatRequest, token: vscode.CancellationToken): Promise<void> {
    // Optional: Pre-process request
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
        model: 'grok-4-latest',
        messages: [{ role: 'user', content: fullPrompt }],
        max_tokens: 9000,
        temperature: 0.5,
        stream: true,
      });

      let fullResponse = '';
      let hasContent = false;
      
      for await (const chunk of response) {
        if (token.isCancellationRequested) {
          return;
        }
        
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          if (!hasContent) {
            stream.progress('📝 Receiving response...');
            hasContent = true;
          }
          fullResponse += content;
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
  }
}

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

async function debugTestCommand(): Promise<void> {
  vscode.window.showInformationMessage('Debug test successful');
}

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

async function uploadFilesCommand(): Promise<void> {
  const files = await vscode.window.showOpenDialog({ canSelectMany: true, canSelectFolders: false });
  if (!files) return;

  let content = '';
  for (const file of files) {
    const fileContent = fs.readFileSync(file.fsPath, 'utf8');
    content += `File: ${path.basename(file.fsPath)}\n${fileContent}\n\n`;
  }

  const preview = await vscode.window.showInformationMessage('File contents preview:\n' + content.substring(0, 200) + '...', 'Upload', 'Cancel');
  if (preview === 'Upload') {
    vscode.window.showInformationMessage('Files uploaded to Grok (simulated).');
  }
}

async function showTokenCountCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const text = editor.document.getText(editor.selection);
  const tokenCount = estimateTokens(text);
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

  const panel = vscode.window.createWebviewPanel(
    'grokSecurityFix',
    'Grok Security Fix',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );
  panel.webview.html = getLoadingHTML();

  await processGrokRequest(panel, code, language, 'find and suggest security fixes for', apiKey);
}

// Tokenization function

async function tokenizeText(text: string) {
  try {
    // Load a tokenizer pipeline (e.g., for BERT)
    const tokenizer = await pipeline('tokenization', 'Xenova/bert-base-uncased');
    const tokens = await tokenizer(text);
    console.log('Tokens:', tokens); // Outputs tokenized array
    return tokens;
  } catch (error) {
    console.error('Tokenization error:', error);
  }
}

// Activation

export async function activate(context: vscode.ExtensionContext) {
  try {
    // Register chat participant
    const grokParticipant = new GrokChatParticipant();
    const participant = vscode.chat.createChatParticipant('grok-integration.grok', grokParticipant.requestHandler);
    
    // Configure participant properties
    participant.iconPath = new vscode.ThemeIcon('hubot');
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

    // Register commands
    const commands = [
      vscode.commands.registerCommand('grok-integration.askGrok', () => askGrokCommand(context)),
      vscode.commands.registerCommand('grok-integration.explainCode', () => explainCodeCommand(context)),
      vscode.commands.registerCommand('grok-integration.reviewCode', () => reviewCodeCommand(context)),
      vscode.commands.registerCommand('grok-integration.askGrokInline', () => askGrokInlineCommand()),
      vscode.commands.registerCommand('grok-integration.editWithGrok', () => editWithGrokCommand()),
      vscode.commands.registerCommand('grok-integration.uploadFiles', () => uploadFilesCommand()),
      vscode.commands.registerCommand('grok-integration.showTokenCount', () => showTokenCountCommand()),
      vscode.commands.registerCommand('grok-integration.debugTest', () => debugTestCommand()),
      vscode.commands.registerCommand('grok-integration.testConnection', () => testConnectionCommand()),
      vscode.commands.registerCommand('grok-integration.securityFix', () => securityFixCommand(context))
    ];

    // Register context menu items
    context.subscriptions.push(
      vscode.commands.registerCommand('grok-integration.explainCodeContext', () => explainCodeCommand(context)),
      vscode.commands.registerCommand('grok-integration.reviewCodeContext', () => reviewCodeCommand(context))
    );

    // Push all to subscriptions
    commands.forEach(cmd => context.subscriptions.push(cmd));

    // Show success message
    vscode.window.showInformationMessage('🤖 Grok Integration activated! Try @grok in chat or right-click selected code.');
    
    // Test tokenization
    tokenizeText('Hello, world! This is a test.').then(tokens => {
      vscode.window.showInformationMessage(`Tokenized: ${JSON.stringify(tokens)}`);
    });
    
  } catch (error) {
    console.error('❌ Extension activation failed:', error);
    vscode.window.showErrorMessage(`Failed to activate Grok Integration: ${error}`);
  }
}

export function deactivate() {
  console.log('🛑 Grok Integration extension deactivating...');
}