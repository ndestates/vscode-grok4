import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as crypto from 'crypto';

// License validation functions
function generateLicenseKey(email: string, secretKey: string = 'your-secret-key-2025'): string {
  const data = `${email}-grok-integration-${new Date().getFullYear()}`;
  const hash = crypto.createHmac('sha256', secretKey).update(data).digest('hex');
  return `GI-${hash.substring(0, 8).toUpperCase()}-${hash.substring(8, 16).toUpperCase()}-${hash.substring(16, 24).toUpperCase()}`;
}

function validateLicenseKey(licenseKey: string, secretKey: string = 'your-secret-key-2025'): boolean {
  if (!licenseKey || !licenseKey.startsWith('GI-')) {
    return false;
  }

  // Basic format validation
  const keyPattern = /^GI-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/;
  if (!keyPattern.test(licenseKey)) {
    return false;
  }

  // For demo purposes, we'll accept any key that matches the format
  // In production, you'd validate against your database/server
  
  // Example of hardcoded valid keys for testing:
  const validKeys = [
    generateLicenseKey('demo@example.com'),
    generateLicenseKey('test@example.com'),
    'GI-12345678-ABCDEFGH-87654321', // Demo key
    'GI-DEMO1234-ABCD5678-EFGH9012'  // Default demo key
  ];

  return validKeys.includes(licenseKey);
}

async function checkLicenseStatus(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const licenseKey = config.get<string>('licenseKey');
  
  // Auto-set demo license if none exists
  if (!licenseKey) {
    const demoKey = 'GI-DEMO1234-ABCD5678-EFGH9012';
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
      const demoKey = 'GI-DEMO1234-ABCD5678-EFGH9012';
      await config.update('licenseKey', demoKey, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('✅ Demo license activated! You can now use Grok Integration.');
      return true;
    } else if (action === 'Enter New License Key') {
      await promptForLicenseKey();
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
      vscode.window.showInformationMessage('License key validated successfully!');
    } else {
      vscode.window.showErrorMessage('Invalid license key format. Please try again.');
    }
  }
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

    // Initialize OpenAI client with xAI base URL
    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1'
    });

    try {
      stream.progress('🤖 Asking Grok...');
      
      // Prepare messages with context if available
      const messages: any[] = [
        { role: 'system', content: 'You are Grok, a helpful AI assistant integrated into VS Code. Provide clear, concise, and helpful responses to coding questions. Use markdown formatting for code examples.' }
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

      // Add current user message
      messages.push({ role: 'user', content: request.prompt });

      // Call Grok API with streaming
      const response = await openai.chat.completions.create({
        model: 'grok-3-beta',
        messages,
        max_tokens: 1500,
        temperature: 0.7,
        stream: true
      });

      // Stream the response
      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          stream.markdown(content);
        }
        
        // Check for cancellation
        if (token.isCancellationRequested) {
          break;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      stream.markdown(`❌ **Error**: ${errorMessage}\n\nPlease check your API key and try again.`);
    }
  });

  // Set up chat participant properties
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
        }
      ];
    }
  };

  // Original command for backward compatibility
  const disposable = vscode.commands.registerCommand('grok-integration.askGrok', async () => {
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
      value: 'Explain this code:'
    });
    if (!userPrompt) return;

    // Initialize OpenAI client with xAI base URL
    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1'
    });

    try {
      // Call Grok API (use 'grok-3-beta' or latest model)
      const response = await openai.chat.completions.create({
        model: 'grok-3-beta',  // Replace with desired model, e.g., 'grok-3-mini-beta'
        messages: [
          { role: 'system', content: 'You are a helpful coding assistant.' },
          { role: 'user', content: `${userPrompt}\n\n${selectedText}` }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      const grokResponse = response.choices[0]?.message?.content || 'No response received.';

      // Display response in a webview panel
      const panel = vscode.window.createWebviewPanel(
        'grokResponse',
        'Grok Response',
        vscode.ViewColumn.Beside,
        {}
      );
      panel.webview.html = `<h1>Grok's Response</h1><pre>${grokResponse}</pre>`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Error calling Grok API: ${errorMessage}`);
    }
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

  context.subscriptions.push(chatParticipant, disposable, enterLicenseCommand, checkLicenseCommand, purchaseLicenseCommand);
}

export function deactivate() {}