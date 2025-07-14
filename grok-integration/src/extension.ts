import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as crypto from 'crypto';
// IMPORTANT: In a production environment, this secret key should be managed securely,
// for instance, through environment variables or a dedicated secrets management service.
// Avoid hardcoding secrets directly in the source code.
const SECRET_KEY = process.env.GROK_LICENSE_SECRET || 'your-default-dev-secret-key-2025';

// License key prefix and product ID
const LICENSE_KEY_PREFIX = 'GI';
const LICENSE_PRODUCT_ID = 'grok-integration';

// License validation functions
/**
 * Generates a license key for a given email address.
 *
 * @param email The email address to generate the license key for.
 * @returns A formatted license key string.
 */
function generateLicenseKey(email: string): string {
  // The data for the hash should be consistent. Using the email and a product identifier
  // ensures that the same key is generated for the same user every time.
  const data = `${email}-${LICENSE_PRODUCT_ID}`;
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  const hash = hmac.update(data).digest('hex');

  // Format the key into readable segments for better user experience.
  const segments = [
    hash.substring(0, 8),
    hash.substring(8, 16),
    hash.substring(16, 24)
  ];

  return `${LICENSE_KEY_PREFIX}-${segments.join('-').toUpperCase()}`;
}

/**
 * Validates a given license key.
 *
 * @param licenseKey The license key to validate.
 * @returns True if the license key is valid, false otherwise.
 */
function validateLicenseKey(licenseKey: string): boolean {
  if (!licenseKey || !licenseKey.startsWith(LICENSE_KEY_PREFIX + '-')) {
    return false;
  }

  // Basic format validation using a regular expression.
  const keyPattern = new RegExp(`^${LICENSE_KEY_PREFIX}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$`);
  if (!keyPattern.test(licenseKey)) {
    return false;
  }

  // For demonstration purposes, a set of hardcoded valid keys are accepted.
  // In a real-world application, this validation would typically be performed
  // against a secure backend service or database.
  const validKeys = [
    generateLicenseKey('demo@example.com'),      // GI-42C37011-2F58C780-240A39A5
    generateLicenseKey('test@example.com'),      // GI-D2E0F489-CE484912-32747E07
    'GI-42C37011-2F58C780-240A39A5',            // Demo key (generated)
    'GI-D2E0F489-CE484912-32747E07',            // Test key (generated)
    'GI-DEMO1234-ABCD5678-EFGH9012'             // Fallback demo key
  ];

  return validKeys.includes(licenseKey);
}

async function checkLicenseStatus(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const licenseKey = config.get<string>('licenseKey');
  
  // Auto-set demo license if none exists
  if (!licenseKey) {
    const demoKey = 'GI-42C37011-2F58C780-240A39A5'; // Generated demo key
    await config.update('licenseKey', demoKey, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('✅ Demo license automatically activated! You can now use Grok Integration.');
    return true;
  }

  if (!validateLicenseKey(licenseKey)) {
    const action = await vscode.window.showErrorMessage(
      '❌ Invalid License: Your license key is not valid.',
      'Reset to Demo Key',
      'Enter New License Key',
      'Contact Support'
    );
    
    if (action === 'Reset to Demo Key') {
      const demoKey = 'GI-42C37011-2F58C780-240A39A5'; // Generated demo key
      await config.update('licenseKey', demoKey, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('✅ Demo license activated! You can now use Grok Integration.');
      return true;
    } else if (action === 'Enter New License Key') {
      await promptForLicenseKey();
      // Re-check after user input
      const newLicenseKey = config.get<string>('licenseKey');
      return newLicenseKey ? validateLicenseKey(newLicenseKey) : false;
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
    if (validateLicenseKey(licenseKey)) {
      const config = vscode.workspace.getConfiguration('grokIntegration');
      await config.update('licenseKey', licenseKey, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('✅ License key validated successfully!');
    } else {
      const action = await vscode.window.showErrorMessage(
        '❌ Invalid license key format. Please try again.',
        'Use Demo Key',
        'Try Again'
      );
      
      if (action === 'Use Demo Key') {
        const config = vscode.workspace.getConfiguration('grokIntegration');
        const demoKey = 'GI-42C37011-2F58C780-240A39A5'; // Generated demo key
        await config.update('licenseKey', demoKey, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('✅ Demo license activated!');
      } else if (action === 'Try Again') {
        await promptForLicenseKey();
      }
    }
  }
}

// Test connection to Grok API
async function testGrokConnection(apiKey: string): Promise<{success: boolean, error?: string}> {
  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
      timeout: 30000  // 30 second timeout
    });

    // Test with a very simple request
    const response = await openai.chat.completions.create({
      model: 'grok-4-0709',  // Use the correct Grok model name
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 3,
      temperature: 0.1
    });

    if (response.choices && response.choices.length > 0) {
      return { success: true };
    } else {
      return { success: false, error: 'No response from Grok API' };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// Show Grok response panel with real-time status
async function showGrokPanel(title: string, code: string, language: string, action: string): Promise<void> {
  console.log('Grok Extension: showGrokPanel called with:', { title, language, action, codeLength: code.length });
  
  // Get API key from settings
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const apiKey = config.get<string>('apiKey');
  
  console.log('Grok Extension: API key present:', !!apiKey);
  
  if (!apiKey) {
    console.log('Grok Extension: No API key found, showing error dialog');
    const userAction = await vscode.window.showErrorMessage(
      '🔑 xAI API Key Required: Please set your xAI API key to use Grok.',
      'Open Settings',
      'How to Get API Key'
    );
    
    if (userAction === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'grokIntegration.apiKey');
    } else if (userAction === 'How to Get API Key') {
      vscode.env.openExternal(vscode.Uri.parse('https://platform.x.ai/'));
    }
    return;
  }

  console.log('Grok Extension: Creating webview panel');
  
  // Create webview panel
  const panel = vscode.window.createWebviewPanel(
    'grokResponse',
    `🤖 Grok: ${title}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  console.log('Grok Extension: Setting HTML content');
  
  // Set initial loading HTML
  panel.webview.html = getLoadingHTML(title, code, language, action);

  console.log('Grok Extension: Starting processGrokRequest');
  
  // Process request in background with timeout
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out after 2 minutes')), 120000)
  );
  
  Promise.race([
    processGrokRequest(panel, code, language, action, apiKey),
    timeoutPromise
  ]).catch(error => {
    console.error('Grok Extension: Request failed or timed out:', error);
    panel.webview.postMessage({ 
      type: 'error', 
      text: `Request failed: ${error.message}. Try again with shorter code or check your connection.` 
    });
  });
}

function getLoadingHTML(title: string, code: string, language: string, action: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Grok ${title}</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                line-height: 1.6;
                margin: 0;
                padding: 20px;
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
            }
            .header {
                display: flex;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 10px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            .icon {
                font-size: 24px;
                margin-right: 10px;
            }
            .title {
                font-size: 18px;
                font-weight: 600;
            }
            .status {
                padding: 15px;
                margin: 10px 0;
                border-radius: 5px;
                background: var(--vscode-textBlockQuote-background);
                border-left: 4px solid var(--vscode-textLink-foreground);
            }
            .code-block {
                background: var(--vscode-textCodeBlock-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 5px;
                padding: 15px;
                margin: 15px 0;
                font-family: 'Courier New', Consolas, monospace;
                overflow-x: auto;
            }
            .language-label {
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 2px 8px;
                border-radius: 3px;
                font-size: 12px;
                margin-bottom: 10px;
                display: inline-block;
            }
            .spinner {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid var(--vscode-panel-border);
                border-radius: 50%;
                border-top-color: var(--vscode-textLink-foreground);
                animation: spin 1s ease-in-out infinite;
                margin-right: 10px;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            .response {
                margin-top: 20px;
                padding: 15px;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 5px;
                min-height: 100px;
            }
            .error {
                color: var(--vscode-errorForeground);
                background: var(--vscode-inputValidation-errorBackground);
                border-left-color: var(--vscode-errorForeground);
            }
        </style>
    </head>
    <body>
        <div class="header">
            <span class="icon">🤖</span>
            <span class="title">Grok AI - ${title}</span>
        </div>
        
        <div class="status" id="status">
            <div class="spinner"></div>
            <strong>🔍 Initializing Grok AI...</strong>
            <div>Preparing your ${action} request...</div>
        </div>
        
        <div>
            <h3>📝 Selected Code:</h3>
            <div class="language-label">${language}</div>
            <div class="code-block">${escapeHtml(code)}</div>
        </div>
        
        <div class="response" id="response" style="display: none;">
            <h3>🧠 Grok's Analysis:</h3>
            <div id="responseContent"></div>
        </div>

        <script>
            window.addEventListener('message', event => {
                const message = event.data;
                const statusDiv = document.getElementById('status');
                const responseDiv = document.getElementById('response');
                const responseContent = document.getElementById('responseContent');
                
                switch(message.type) {
                    case 'status':
                        statusDiv.innerHTML = '<div class="spinner"></div><strong>' + message.text + '</strong>';
                        break;
                    case 'response':
                        responseDiv.style.display = 'block';
                        responseContent.innerHTML = message.content;
                        statusDiv.style.display = 'none';
                        break;
                    case 'error':
                        statusDiv.className = 'status error';
                        statusDiv.innerHTML = '<strong>❌ Error:</strong> ' + message.text;
                        break;
                }
            });
        </script>
    </body>
    </html>
  `;
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

async function processGrokRequest(panel: vscode.WebviewPanel, code: string, language: string, action: string, apiKey: string): Promise<void> {
  console.log('Grok Extension: processGrokRequest started with:', { language, action, codeLength: code.length });
  
  try {
    console.log('Grok Extension: Updating status to connecting...');
    // Update status
    panel.webview.postMessage({ type: 'status', text: '🔍 Connecting to Grok API...' });
    
    console.log('Grok Extension: Testing connection...');
    // Test connection first
    const connectionTest = await testGrokConnection(apiKey);
    console.log('Grok Extension: Connection test result:', connectionTest);
    if (!connectionTest.success) {
      console.log('Grok Extension: Connection failed:', connectionTest.error);
      panel.webview.postMessage({ 
        type: 'error', 
        text: `Connection failed: ${connectionTest.error}. Please check your API key and internet connection.` 
      });
      return;
    }

    console.log('Grok Extension: Connection successful, updating status...');
    panel.webview.postMessage({ type: 'status', text: '✅ Connected! Asking Grok...' });

    console.log('Grok Extension: Initializing OpenAI client...');
    // Initialize OpenAI client with timeout
    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
      timeout: 60000  // 60 second timeout for actual requests
    });

    // Prepare system prompt based on action
    let systemPrompt = '';
    let userMessage = '';
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

    panel.webview.postMessage({ type: 'status', text: '💭 Grok is thinking...' });

    // Call Grok API with optimized settings
    const response = await openai.chat.completions.create({
      model: 'grok-4-0709',  // Use the correct Grok model name
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 3000,  // Increased for more complete responses
      temperature: 0.7   // Balanced for creative yet focused responses
    });

    const grokResponse = response.choices[0]?.message?.content || 'No response received from Grok.';
    
    // Convert markdown to HTML for better display
    const htmlResponse = convertMarkdownToHtml(grokResponse);
    panel.webview.postMessage({ type: 'response', content: htmlResponse });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    let troubleshooting = 'Please verify your API key and try again.';
    if (errorMessage.includes('401')) {
      troubleshooting = 'Invalid API key. Please check your xAI API key in settings.';
    } else if (errorMessage.includes('429')) {
      troubleshooting = 'Rate limit exceeded. Please wait a moment and try again.';
    } else if (errorMessage.includes('insufficient_quota')) {
      troubleshooting = 'API quota exhausted. Please check your xAI account billing.';
    }
    
    panel.webview.postMessage({ 
      type: 'error', 
      text: `${errorMessage}. ${troubleshooting}` 
    });
  }
}

function convertMarkdownToHtml(markdown: string): string {
  // Basic markdown to HTML conversion for common patterns
  let html = markdown;
  
  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, 
    '<div class="language-label">$1</div><div class="code-block">$2</div>');
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px;">$1</code>');
  
  // Bold text
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic text
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  
  // Wrap in paragraphs
  html = '<p>' + html + '</p>';
  
  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  
  return html;
}

// --- Token Estimation Utility ---
function estimateTokenCount(text: string): number {
  // Simple heuristic: 1 token ≈ 4 characters (OpenAI guidance)
  return Math.ceil(text.length / 4);
}

async function showTokenCount(selectedText: string): Promise<void> {
  const tokenCount = estimateTokenCount(selectedText);
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const maxTokens = config.get<number>('maxTokens', 3000);

  // Create webview panel
  const panel = vscode.window.createWebviewPanel(
    'grokTokenCount',
    '🔢 Grok: Token Count',
    vscode.ViewColumn.Beside,
    { enableScripts: false }
  );

  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Grok Token Count</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; margin: 0; padding: 2em; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
        .count { font-size: 2em; font-weight: bold; margin: 1em 0; }
        .max { color: var(--vscode-descriptionForeground); }
        .tip { margin-top: 1em; color: var(--vscode-descriptionForeground); font-size: 0.95em; }
        .code-block { background: var(--vscode-textCodeBlock-background); border-radius: 5px; padding: 1em; margin-top: 1em; font-family: 'Courier New', monospace; white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <h2>🔢 Token Count Estimate</h2>
      <div class="count">${tokenCount} tokens</div>
      <div class="max">Max tokens allowed: <b>${maxTokens}</b></div>
      <div class="tip">1 token ≈ 4 characters. If your request is too large, consider selecting less code or increasing <b>maxTokens</b> in settings.</div>
      <h3>Selected Code:</h3>
      <div class="code-block">${selectedText.length > 1000 ? selectedText.substring(0, 1000) + '... (truncated)' : selectedText}</div>
    </body>
    </html>
  `;
}

// Show Token Count Command
const showTokenCountCommand = vscode.commands.registerCommand('grok-integration.showTokenCount', async () => {
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

  showTokenCount(selectedText);
});

const uploadFilesCommand = vscode.commands.registerCommand('grok-integration.uploadFiles', async () => {
  // Prompt for files and/or folders
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
        systemPrompt = 'You are Grok, a security expert. Analyze the code for security vulnerabilities, potential attack vectors, and suggest security improvements. Focus on common security issues like injection attacks, authentication flaws, data exposure, and insecure configurations.';
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
      await showGrokPanel('Explain Code', selectedText, editor.document.languageId, 'explain');
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
    await showGrokPanel('Review Code', selectedText, editor.document.languageId, 'review');
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
    await showGrokPanel(userPrompt, `${userPrompt}\n\n\`\`\`${editor.document.languageId}\n${selectedText}\n\`\`\``, editor.document.languageId, 'analyze');
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
    } else if (validateLicenseKey(licenseKey)) {
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