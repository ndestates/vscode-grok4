import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import DOMPurify from 'dompurify';
import { encode } from 'gpt-tokenizer';

// --- TypeScript: Add global type for __grokApiRateLimit ---
declare global {
  // eslint-disable-next-line no-var
  var __grokApiRateLimit: { count: number; reset: number } | undefined;
}

// Rate limiting: Simple in-memory counter (reset every minute)
let requestCount = 0;
const MAX_REQUESTS_PER_MINUTE = 5;
setInterval(() => { requestCount = 0; }, 60000); // Reset every minute

// License key prefix and product ID
const LICENSE_KEY_PREFIX = 'GI';
const LICENSE_PRODUCT_ID = 'grok-integration';

// Helper: Store/retrieve license key using VS Code configuration
function getLicenseKey(): string | undefined {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  return config.get<string>('licenseKey');
}

async function storeLicenseKey(licenseKey: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  await config.update('licenseKey', licenseKey, vscode.ConfigurationTarget.Global);
}

// License validation functions
function generateLicenseKey(email: string): string {
  // Note: SECRET_KEY removed; in production, this should be server-side only
  const data = `${email}-${LICENSE_PRODUCT_ID}`;
  const hmac = crypto.createHmac('sha256', 'secure-server-side-secret'); // Placeholder; move to backend
  const hash = hmac.update(data).digest('hex');
  const segments = [hash.substring(0, 8), hash.substring(8, 16), hash.substring(16, 24)];
  return `${LICENSE_KEY_PREFIX}-${segments.join('-').toUpperCase()}`;
}

async function validateLicenseKey(licenseKey: string): Promise<boolean> {
  if (!licenseKey || !licenseKey.startsWith(LICENSE_KEY_PREFIX + '-')) {
    return false;
  }
  const keyPattern = new RegExp(`^${LICENSE_KEY_PREFIX}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$`);
  if (!keyPattern.test(licenseKey)) {
    return false;
  }

  // Placeholder for server-side validation (replace with real API call)
  // e.g., const response = await fetch('https://your-backend/validate', { method: 'POST', body: JSON.stringify({ key: licenseKey }) });
  // return response.ok;
  // For demo, accept generated keys (but this should be removed in prod)
  const demoKeys = [generateLicenseKey('demo@example.com'), generateLicenseKey('test@example.com')];
  return demoKeys.includes(licenseKey);
}

async function checkLicenseStatus(): Promise<boolean> {
  const licenseKey = getLicenseKey();
  if (!licenseKey) {
    const action = await vscode.window.showInformationMessage(
      'No license found. Use demo mode?',
      'Yes, Use Demo',
      'Enter Key'
    );
    if (action === 'Yes, Use Demo') {
      const demoKey = generateLicenseKey('demo@example.com');
      await storeLicenseKey(demoKey);
      vscode.window.showInformationMessage('✅ Demo license activated!');
      return true;
    } else if (action === 'Enter Key') {
      await promptForLicenseKey();
      return checkLicenseStatus(); // Recheck
    }
    return false;
  }

  const isValid = await validateLicenseKey(licenseKey);
  if (!isValid) {
    const action = await vscode.window.showErrorMessage('❌ Invalid License', 'Reset to Demo', 'Enter New Key', 'Contact Support');
    if (action === 'Reset to Demo') {
      const demoKey = generateLicenseKey('demo@example.com');
      await storeLicenseKey(demoKey);
      vscode.window.showInformationMessage('✅ Demo license activated!');
      return true;
    } else if (action === 'Enter New Key') {
      await promptForLicenseKey();
      return checkLicenseStatus();
    } else if (action === 'Contact Support') {
      vscode.env.openExternal(vscode.Uri.parse('mailto:support@your-website.com'));
    }
    return false;
  }
  return true;
}

async function promptForLicenseKey(): Promise<void> {
  const licenseKey = await vscode.window.showInputBox({
    prompt: 'Enter your Grok Integration license key',
    placeHolder: 'GI-XXXXXXXX-XXXXXXXX-XXXXXXXX',
    ignoreFocusOut: true
  });

  if (licenseKey) {
    if (await validateLicenseKey(licenseKey)) {
      await storeLicenseKey(licenseKey);
      vscode.window.showInformationMessage('✅ License key validated successfully!');
    } else {
      const action = await vscode.window.showErrorMessage('❌ Invalid key', 'Use Demo', 'Try Again');
      if (action === 'Use Demo') {
        const demoKey = generateLicenseKey('demo@example.com');
        await storeLicenseKey(demoKey);
        vscode.window.showInformationMessage('✅ Demo license activated!');
      } else if (action === 'Try Again') {
        await promptForLicenseKey();
      }
    }
  }
}

// Redact potential secrets (basic heuristic)
function redactSecrets(text: string): string {
  return text.replace(/(api_key|password|secret|token)=[^& \n]+/gi, '$1=REDACTED');
}

// Test connection to Grok API
async function testGrokConnection(apiKey: string): Promise<{success: boolean, error?: string}> {
  try {
    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 30000 });
    const response = await openai.chat.completions.create({
      model: 'grok-4-0709',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 3,
      temperature: 0.1
    });
    return { success: !!response.choices?.length };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Show Grok response panel with consent and security
async function showGrokPanel(context: vscode.ExtensionContext, title: string, code: string, language: string, action: string): Promise<void> {
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    vscode.window.showErrorMessage('Rate limit exceeded. Please wait a minute.');
    return;
  }
  requestCount++;

  const consent = await vscode.window.showInformationMessage(
    'This will send selected code to xAI API. Proceed?',
    'Yes',
    'No'
  );
  if (consent !== 'Yes') return;

  const config = vscode.workspace.getConfiguration('grokIntegration');
  const apiKey = config.get<string>('apiKey');
  if (!apiKey) {
    const userAction = await vscode.window.showErrorMessage(
      '🔑 xAI API Key Required',
      'Open Settings',
      'How to Get API Key'
    );
    if (userAction === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
    } else if (userAction === 'How to Get API Key') {
      vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/'));
    } else if (userAction === 'Enter API Key') {
      const key = await vscode.window.showInputBox({ prompt: 'Enter xAI API Key', password: true });
      if (key) {
        await storeSecret(context, 'apiKey', key);
        const test = await testGrokConnection(key);
        if (!test.success) {
          vscode.window.showErrorMessage(`Invalid API key: ${test.error}`);
          await context.secrets.delete('apiKey'); // Remove invalid key
        } else {
          vscode.window.showInformationMessage('API key validated!');
        }
      }
    }
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'grokResponse',
    `🤖 Grok: ${title}`,
    vscode.ViewColumn.Beside,
    { enableScripts: false } // Disabled for security
  );

  // Use MarkdownString for safe rendering
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`# Grok AI - ${title}\n\n`);
  md.appendMarkdown('🔍 Initializing...\n\n');
  md.appendMarkdown('### Selected Code:\n\n');
  md.appendCodeblock(code, language);
  panel.webview.html = md.value; // Note: For full safety, use a webview with postMessage if dynamic updates needed

  await processGrokRequest(panel, redactSecrets(code), language, action, apiKey);
}

async function processGrokRequest(panel: vscode.WebviewPanel, code: string, language: string, action: string, apiKey: string): Promise<void> {
  // --- Rate limiting: allow up to 5 API calls per minute ---
  if (!globalThis.__grokApiRateLimit) {
    globalThis.__grokApiRateLimit = { count: 0, reset: Date.now() + 60000 };
  }
  const rate = globalThis.__grokApiRateLimit;
  if (Date.now() > rate.reset) {
    rate.count = 0;
    rate.reset = Date.now() + 60000;
  }
  if (rate.count >= 5) {
    const md = new vscode.MarkdownString('❌ Error: Rate limit exceeded. Please wait a minute and try again.');
    panel.webview.html = md.value;
    return;
  }
  rate.count++;

  try {
    const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', timeout: 60000 });
    let systemPrompt = `You are Grok, a helpful AI built by xAI. ${action} the following ${language} code.`;
    const workspaceContext = await getWorkspaceContext();
    const contextConsent = await vscode.window.showInformationMessage('Include workspace context in prompt?', 'Yes', 'No');
    if (contextConsent === 'Yes') {
      systemPrompt += `\nWorkspace context: ${redactSecrets(workspaceContext)}`;
    }
    let userMessage = redactSecrets(code); // Already good, but enhance redactSecrets if needed
    switch (action) {
      case 'explain':
        systemPrompt = 'You are Grok. Explain this code concisely but thoroughly. Focus on key concepts and functionality.';
        userMessage = `Explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``;
        break;
      case 'review':
        systemPrompt = 'You are Grok. Review this code for issues, improvements, and best practices. Be specific and constructive.';
        userMessage = `Review this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``;
        break;
      case 'analyze':
        systemPrompt = 'You are Grok. Analyze the provided code and provide helpful insights.';
        userMessage = `${code}`;  // For analyze, the code contains the user's prompt and code
        break;
      default:
        systemPrompt = 'You are Grok. Analyze this code and provide helpful insights.';
        userMessage = `Analyze this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``;
    }

    // Use a high max_tokens value for long replies
    const response = await openai.chat.completions.create({
      model: 'grok-4-0709',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 9000,
      temperature: 0.5
    });

    const grokResponse = response.choices[0]?.message?.content || 'No response';
    const sanitizedResponse = DOMPurify.sanitize(grokResponse);
    if (sanitizedResponse.length > 100000) { // Arbitrary limit to prevent DoS
      throw new Error('Response too long');
    }
    const responseMd = new vscode.MarkdownString(sanitizedResponse, true);
    panel.webview.html = responseMd.value;
  } catch (error) {
    let message = 'Unknown error';
    if (error && typeof error === 'object' && 'message' in error) {
      message = (error as any).message;
    } else if (typeof error === 'string') {
      message = error;
    }
    const md = new vscode.MarkdownString(`❌ Error: ${message}`);
    panel.webview.html = md.value;
  }
}

// Token estimation and other functions refactored similarly (use MarkdownString, add consent/rate limiting)

// Upload Files Command with filtering and consent
const uploadFilesCommand = vscode.commands.registerCommand('grok-integration.uploadFiles', async () => {
  const consent = await vscode.window.showInformationMessage(
    'This may expose files. Proceed?',
    'Yes',
    'No'
  );
  if (consent !== 'Yes') return;

  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: true,
    openLabel: 'Upload to Grok'
  });
  if (!uris || uris.length === 0) {
    vscode.window.showInformationMessage('No files or folders selected for upload.');
    return;
  }

  // Gather all file paths (recursively for folders)
  let fileUris: vscode.Uri[] = [];
  for (const uri of uris) {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type === vscode.FileType.File) {
      fileUris.push(uri);
    } else if (stat.type === vscode.FileType.Directory) {
      // Recursively collect files in folder
      const collectFiles = async (dir: vscode.Uri) => {
        const entries = await vscode.workspace.fs.readDirectory(dir);
        for (const [name, type] of entries) {
          const entryUri = vscode.Uri.joinPath(dir, name);
          if (type === vscode.FileType.File) {
            fileUris.push(entryUri);
          } else if (type === vscode.FileType.Directory) {
            await collectFiles(entryUri);
          }
        }
      };
      await collectFiles(uri);
    }
  }

  if (fileUris.length === 0) {
    vscode.window.showWarningMessage('No files found in selected folders.');
    return;
  }

  // Show a webview with the list of files to be uploaded
  const panel = vscode.window.createWebviewPanel(
    'grokUploadFiles',
    '📂 Grok: Upload Files',
    vscode.ViewColumn.Beside,
    { enableScripts: false }
  );
  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Grok Upload Files</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; margin: 0; padding: 2em; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
        .file-list { margin: 1em 0; }
        .file-item { margin-bottom: 0.5em; }
      </style>
    </head>
    <body>
      <h2>📂 Files to Upload to Grok</h2>
      <div class="file-list">
        ${fileUris.map(uri => `<div class="file-item">${uri.fsPath}</div>`).join('')}
      </div>
      <div>Total files: <b>${fileUris.length}</b></div>
      <div style="margin-top:1em; color:var(--vscode-descriptionForeground);">(Upload to Grok will be implemented in a future update.)</div>
    </body>
    </html>
  `;
});



// Helper: Securely store/retrieve secrets using VS Code SecretStorage
async function getSecret(context: vscode.ExtensionContext, key: string): Promise<string | undefined> {
  return context.secrets.get(key);
}

async function storeSecret(context: vscode.ExtensionContext, key: string, value: string): Promise<void> {
  await context.secrets.store(key, value);
}

// Helper: Get workspace context (limited to avoid exposure)
async function getWorkspaceContext(): Promise<string> {
  // Limited to basic info; no full file contents
  return `Workspace: ${vscode.workspace.name || 'Untitled'}`;
}

export function activate(context: vscode.ExtensionContext) {
  // Register the chat participant
  const chatParticipant = vscode.chat.createChatParticipant('grok-integration.grok', async (request, context, stream, token) => {
    // Check license first
    const isLicensed = await checkLicenseStatus();
    if (!isLicensed) {
      stream.markdown('❌ **License Required**: Please activate your license first.');
      return;
    }

    // Get API key from settings
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const apiKey = config.get<string>('apiKey');
    
    if (!apiKey) {
      stream.markdown('❌ **API Key Required**: Please set your xAI API key in settings.\n\n[Open Settings](command:workbench.action.openSettings?%5B%22grokIntegration.apiKey%22%5D) | [Get API Key](https://platform.x.ai/)');
      return;
    }

    // Handle slash commands
    const command = request.command;
    let systemPrompt = 'You are Grok, a helpful AI assistant integrated into VS Code. Provide clear, concise, and helpful responses to coding questions. Use markdown formatting for code examples.';
    let userPrompt = request.prompt;

    switch (command) {
      case 'explain':
        systemPrompt = 'You are Grok, an expert code explainer. Analyze the provided code and explain what it does, how it works, and any important concepts. Be thorough but clear.';
        break;
      case 'review':
        systemPrompt = 'You are Grok, a senior code reviewer. Review the provided code for potential issues, improvements, best practices, and suggest optimizations. Be constructive and specific.';
        break;
      case 'debug':
        systemPrompt = 'You are Grok, a debugging expert. Help identify potential bugs, issues, or problems in the code. Suggest fixes and explain the root causes.';
        break;
      case 'refactor':
        systemPrompt = 'You are Grok, a refactoring specialist. Suggest ways to improve code structure, readability, maintainability, and performance while preserving functionality.';
        break;
      case 'test':
        systemPrompt = 'You are Grok, a testing expert. Generate comprehensive unit tests for the provided code. Include edge cases and follow testing best practices.';
        break;
      case 'optimize':
        systemPrompt = 'You are Grok, a performance optimization expert. Analyze the code for performance bottlenecks and suggest optimizations.';
        break;
      case 'security':
        systemPrompt = 'You are Grok, a senior security expert. Analyze the code for security vulnerabilities, potential attack vectors, and suggest security fixes and improvements. Focus on common security issues like injection attacks, authentication flaws, data exposure, and insecure configurations.';
        break;
    }

    // Initialize OpenAI client with xAI base URL and timeout
    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
      timeout: 90000  // 90 second timeout for longer responses
    });

    try {
      stream.progress('🔍 Connecting to Grok API...');
      
      // Test connection first
      const connectionTest = await testGrokConnection(apiKey);
      if (!connectionTest.success) {
        stream.markdown(`❌ **Connection Failed**: ${connectionTest.error}\n\n**Troubleshooting:**\n- Check your API key is correct\n- Verify you have internet connection\n- Ensure your API key has sufficient credits\n\n[Get API Key](https://platform.x.ai/) | [Open Settings](command:workbench.action.openSettings?%5B%22grokIntegration.apiKey%22%5D)`);
        return;
      }

      stream.progress('✅ Connected! Asking Grok...');
      
      // Get workspace context if available
      let workspaceContext = '';
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const document = activeEditor.document;
        const selection = activeEditor.selection;
        
        if (!selection.isEmpty) {
          const selectedText = document.getText(selection);
          workspaceContext = `\n\nSelected code from ${document.fileName}:\n\`\`\`${document.languageId}\n${selectedText}\n\`\`\``;
        } else if (request.references && request.references.length > 0) {
          // Include referenced files/code
          for (const ref of request.references) {
            if (ref.value instanceof vscode.Uri) {
              const doc = await vscode.workspace.openTextDocument(ref.value);
              const code = doc.getText();
              workspaceContext += `\n\nCode from ${doc.fileName}:\n\`\`\`${doc.languageId}\n${code}\n\`\`\``;
            } else if (ref.value && typeof ref.value === 'string') {
              const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(ref.value));
              const code = doc.getText();
              workspaceContext += `\n\nCode from ${doc.fileName}:\n\`\`\`${doc.languageId}\n${code}\n\`\`\``;
            }
          }
        }
      }

      // Prepare messages with context if available
      const messages: any[] = [
        { role: 'system', content: systemPrompt }
      ];

      // Add conversation history if available
      if (context.history.length > 0) {
        context.history.forEach(entry => {
          if (entry instanceof vscode.ChatRequestTurn) {
            messages.push({ role: 'user', content: entry.prompt });
          } else if (entry instanceof vscode.ChatResponseTurn) {
            const responseText = entry.response.map(r => {
              if (r instanceof vscode.ChatResponseMarkdownPart) {
                return r.value.value;
              }
              return r.value || '';
            }).join('');
            messages.push({ role: 'assistant', content: responseText });
          }
        });
      }

      // Add current user message with workspace context
      const finalPrompt = userPrompt + workspaceContext;
      messages.push({ role: 'user', content: finalPrompt });

      stream.progress('💭 Grok is thinking...');

      // Call Grok API with streaming and optimized settings
      const response = await openai.chat.completions.create({
        model: 'grok-4-0709',  // Use the correct Grok model name
        messages,
        max_tokens: 3000,    // Increased for more complete responses
        temperature: 0.7,    // Balanced for creative yet focused responses
        stream: true
      });

      let responseReceived = false;
      let fullResponse = '';
      
      // Stream the response
      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          if (!responseReceived) {
            stream.progress('📝 Receiving response...');
            responseReceived = true;
          }
          fullResponse += content;
          stream.markdown(content);
        }
        
        // Check for cancellation
        if (token.isCancellationRequested) {
          stream.markdown('\n\n⏹️ *Response cancelled by user*');
          break;
        }
      }

      // Check if response was truncated and notify user
      if (fullResponse.length > 2900) {
        stream.markdown('\n\n💡 *Response may have been truncated due to length limits. For longer responses, try asking more specific questions.*');
      }

      if (!responseReceived) {
        stream.markdown('⚠️ **No response received from Grok**\n\nThis might indicate:\n- API quota exhausted\n- Network connectivity issues\n- Service temporarily unavailable\n\nPlease try again in a moment.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Enhanced error handling with specific messages
      let troubleshooting = '';
      if (errorMessage.includes('401')) {
        troubleshooting = '\n\n**Troubleshooting:** Invalid API key. Please check your xAI API key in settings.';
      } else if (errorMessage.includes('429')) {
        troubleshooting = '\n\n**Troubleshooting:** Rate limit exceeded. Please wait a moment and try again.';
      } else if (errorMessage.includes('insufficient_quota')) {
        troubleshooting = '\n\n**Troubleshooting:** API quota exhausted. Please check your xAI account billing.';
      } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
        troubleshooting = '\n\n**Troubleshooting:** Network connection issue. Please check your internet connection.';
      } else {
        troubleshooting = '\n\n**Troubleshooting:** Please verify your API key and try again.';
      }
      
      stream.markdown(`❌ **Error**: ${errorMessage}${troubleshooting}\n\n[Open Settings](command:workbench.action.openSettings?%5B%22grokIntegration.apiKey%22%5D) | [Get API Key](https://platform.x.ai/)`);
    }
  });

  // Set up chat participant properties with icon
  chatParticipant.iconPath = new vscode.ThemeIcon('robot');

  chatParticipant.followupProvider = {
    provideFollowups(result: vscode.ChatResult, context: vscode.ChatContext, token: vscode.CancellationToken) {
      return [
        {
          prompt: 'Explain this in more detail',
          label: '🔍 More details',
          command: 'followup'
        },
        {
          prompt: 'Show me an example',
          label: '💡 Show example', 
          command: 'example'
        },
        {
          prompt: 'How can I improve this code?',
          label: '⚡ Improve code',
          command: 'improve'
        },
        {
          prompt: 'Are there any issues with this approach?',
          label: '🐛 Find issues',
          command: 'issues'
        },
        {
          prompt: 'Generate tests for this code',
          label: '🧪 Generate tests',
          command: 'test'
        }
      ];
    }
  };

  // Register inline chat and edit commands for Ask and Edit experience
  const askGrokInlineCommand = vscode.commands.registerCommand('grok-integration.askGrokInline', async () => {
    // Check license first
    const isLicensed = await checkLicenseStatus();
    if (!isLicensed) {
      return;
    }

    // Get API key from settings
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const apiKey = config.get<string>('apiKey');
    if (!apiKey) {
      const action = await vscode.window.showErrorMessage(
        '🔑 xAI API Key Required: Please set your xAI API key to use Grok.',
        'Open Settings',
        'How to Get API Key'
      );
      
      if (action === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
      } else if (action === 'How to Get API Key') {
        vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/'));
      }
      return;
    }

    // Open the chat panel and mention grok
    await vscode.commands.executeCommand('workbench.action.chat.open');
    // Insert @grok mention to start conversation
    await vscode.commands.executeCommand('workbench.action.chat.insertAtCursor', '@grok ');
  });

  const editWithGrokCommand = vscode.commands.registerCommand('grok-integration.editWithGrok', async () => {
    // Check license first
    const isLicensed = await checkLicenseStatus();
    if (!isLicensed) {
      return;
    }

    // Get API key from settings
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const apiKey = config.get<string>('apiKey');
    if (!apiKey) {
      const action = await vscode.window.showErrorMessage(
        '🔑 xAI API Key Required: Please set your xAI API key to use Grok.',
        'Open Settings',
        'How to Get API Key'
      );
      
      if (action === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
      } else if (action === 'How to Get API Key') {
        vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/'));
      }
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor.');
      return;
    }

    // Get selected text or use entire document
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection).trim();
    
    if (!selectedText && selection.isEmpty) {
      // If nothing is selected, prompt for inline chat
      await vscode.commands.executeCommand('inlineChat.start');
      return;
    }

    // Open chat with selected code context
    await vscode.commands.executeCommand('workbench.action.chat.open');
    
    // Create a prompt for code editing
    const prompt = `@grok Please help me edit this ${editor.document.languageId} code:\n\n\`\`\`${editor.document.languageId}\n${selectedText}\n\`\`\`\n\nWhat would you like me to do with this code?`;
    await vscode.commands.executeCommand('workbench.action.chat.insertAtCursor', prompt);
  });

  // Register context menu items
  const explainCodeCommand = vscode.commands.registerCommand('grok-integration.explainCode', async () => {
    console.log('Grok Extension: explainCodeCommand triggered');
    
    try {
      console.log('Grok Extension: Checking license status...');
      // Check license first
      const isLicensed = await checkLicenseStatus();
      console.log('Grok Extension: License status:', isLicensed);
      if (!isLicensed) {
        console.log('Grok Extension: License validation failed');
        vscode.window.showErrorMessage('❌ License validation failed. Please check your license.');
        return;
      }
      
      console.log('Grok Extension: Getting active editor...');
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        console.log('Grok Extension: No active editor found');
        vscode.window.showErrorMessage('❌ No active editor found.');
        return;
      }

      console.log('Grok Extension: Getting selection...');
      const selection = editor.selection;
      const selectedText = editor.document.getText(selection).trim();
      console.log('Grok Extension: Selected text length:', selectedText.length);
      
      if (!selectedText) {
        console.log('Grok Extension: No text selected');
        vscode.window.showErrorMessage('❌ Please select code to explain.');
        return;
      }

      // Debug info
      console.log('Grok Extension: Explaining code:', selectedText.substring(0, 100) + '...');
      console.log('Grok Extension: Language ID:', editor.document.languageId);
      
      // Show immediate feedback
      vscode.window.showInformationMessage('🔍 Starting code explanation...');
      
      // Create explanation panel
      console.log('Grok Extension: Calling showGrokPanel...');
      await showGrokPanel(context, 'Explain Code', selectedText, editor.document.languageId, 'explain');
      console.log('Grok Extension: showGrokPanel completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Grok Extension Error in explainCodeCommand:', error);
      vscode.window.showErrorMessage(`❌ Grok Explain Error: ${errorMessage}`);
    }
  });

  const reviewCodeCommand = vscode.commands.registerCommand('grok-integration.reviewCode', async () => {
    // Check license first
    const isLicensed = await checkLicenseStatus();
    if (!isLicensed) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection).trim();
    
    if (!selectedText) {
      vscode.window.showErrorMessage('Please select code to review.');
      return;
    }

    // Create review panel
    await showGrokPanel(context, 'Review Code', selectedText, editor.document.languageId, 'review');
  });

  // Original command for backward compatibility
  const disposable = vscode.commands.registerCommand('grok-integration.askGrok', async () => {
    // Check license first
    const isLicensed = await checkLicenseStatus();
    if (!isLicensed) {
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
      value: 'Explain this code',
      placeHolder: 'e.g., Explain this code, Review for bugs, Optimize performance'
    });
    if (!userPrompt) return;

    // Use the new panel system
    await showGrokPanel(context, userPrompt, `${userPrompt}\n\n\`\`\`${editor.document.languageId}\n${selectedText}\n\`\`\``, editor.document.languageId, 'analyze');
  });
  
  context.subscriptions.push(uploadFilesCommand);

  // Test connection command
  const testConnectionCommand = vscode.commands.registerCommand('grok-integration.testConnection', async () => {
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const apiKey = config.get<string>('apiKey');
    
    if (!apiKey) {
      const action = await vscode.window.showErrorMessage(
        '🔑 API Key Required: Please set your xAI API key first.',
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
      
      const result = await testGrokConnection(apiKey);
      
      progress.report({ increment: 80, message: "Verifying response..." });
      
      if (result.success) {
        vscode.window.showInformationMessage('✅ Grok API Connection Successful! Ready to use @grok in chat.');
      } else {
        const action = await vscode.window.showErrorMessage(
          `❌ Connection Failed: ${result.error}`,
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
  });

  // License management commands
  const enterLicenseCommand = vscode.commands.registerCommand('grok-integration.enterLicenseKey', async () => {
    await promptForLicenseKey();
  });

  const checkLicenseCommand = vscode.commands.registerCommand('grok-integration.checkLicense', async () => {
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const licenseKey = config.get<string>('licenseKey');
    
    if (!licenseKey) {
      vscode.window.showWarningMessage('No license key found. Please enter your license key.');
      await promptForLicenseKey();
    } else if (await validateLicenseKey(licenseKey)) {
      vscode.window.showInformationMessage('✅ License key is valid and active.');
    } else {
      vscode.window.showErrorMessage('❌ Invalid license key. Please contact support or purchase a new license.');
    }
  });

  const purchaseLicenseCommand = vscode.commands.registerCommand('grok-integration.purchaseLicense', async () => {
    const action = await vscode.window.showInformationMessage(
      'Purchase Grok Integration License ($50 USD)',
      'Open Purchase Page',
      'Reset to Demo Key'
    );
    
    if (action === 'Open Purchase Page') {
      vscode.env.openExternal(vscode.Uri.parse('https://your-website.com/purchase'));
    } else if (action === 'Reset to Demo Key') {
      // Reset to demo key
      const demoKey = 'GI-DEMO1234-ABCD5678-EFGH9012';
      const config = vscode.workspace.getConfiguration('grokIntegration');
      await config.update('licenseKey', demoKey, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Demo license key activated: ${demoKey}`);
    }
  });

  // Debug test command
  const debugTestCommand = vscode.commands.registerCommand('grok-integration.debugTest', async () => {
    console.log('Grok Extension: Debug test command triggered');
    vscode.window.showInformationMessage('🔧 Debug Test: Extension is active and responding!');
    
    // Test webview creation
    try {
      console.log('Grok Extension: Creating test webview panel...');
      const panel = vscode.window.createWebviewPanel(
        'grokDebugTest',
        '🧪 Grok Debug Test',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );
      
      panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head><title>Debug Test</title></head>
        <body>
          <h1>🧪 Grok Debug Test</h1>
          <p>If you can see this panel, webview creation is working!</p>
          <p>Time: ${new Date().toISOString()}</p>
        </body>
        </html>
      `;
      
      console.log('Grok Extension: Test webview panel created successfully');
      vscode.window.showInformationMessage('✅ Test webview panel created! Check for new panel.');
    } catch (error) {
      console.error('Grok Extension: Error creating test webview:', error);
      vscode.window.showErrorMessage(`❌ Webview creation failed: ${error}`);
    }
  });

  context.subscriptions.push(chatParticipant, disposable, testConnectionCommand, enterLicenseCommand, checkLicenseCommand, purchaseLicenseCommand, askGrokInlineCommand, editWithGrokCommand, explainCodeCommand, reviewCodeCommand, debugTestCommand, uploadFilesCommand);
}

export function deactivate() { 
  console.log('Grok Extension: Deactivating...');
  // Perform any necessary cleanup here
}

// Add dependency: npm i gpt-tokenizer
function estimateTokens(text: string): number {
  try {
    return encode(text).length;
  } catch {
    return text.split(/\s+/).length; // Fallback
  }
}