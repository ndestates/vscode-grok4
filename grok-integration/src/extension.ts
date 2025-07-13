import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as crypto from 'crypto';

const LICENSE_KEY_PREFIX = 'GI';
const LICENSE_PRODUCT_ID = 'grok-integration';
// IMPORTANT: In a production environment, this secret key should be managed securely,
// for instance, through environment variables or a dedicated secrets management service.
// Avoid hardcoding secrets directly in the source code.
const SECRET_KEY = process.env.GROK_LICENSE_SECRET || 'your-default-dev-secret-key-2025';

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
    }

    // Initialize OpenAI client with xAI base URL
    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1'
    });

    try {
      stream.progress('🤖 Asking Grok...');
      
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

      // Call Grok API with streaming
      const response = await openai.chat.completions.create({
        model: 'grok-3-beta',
        messages,
        max_tokens: 2000,
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
      vscode.window.showErrorMessage('Please select code to explain.');
      return;
    }

    await vscode.commands.executeCommand('workbench.action.chat.open');
    const prompt = `@grok /explain\n\n\`\`\`${editor.document.languageId}\n${selectedText}\n\`\`\``;
    await vscode.commands.executeCommand('workbench.action.chat.insertAtCursor', prompt);
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

    await vscode.commands.executeCommand('workbench.action.chat.open');
    const prompt = `@grok /review\n\n\`\`\`${editor.document.languageId}\n${selectedText}\n\`\`\``;
    await vscode.commands.executeCommand('workbench.action.chat.insertAtCursor', prompt);
  });

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

  context.subscriptions.push(chatParticipant, disposable, enterLicenseCommand, checkLicenseCommand, purchaseLicenseCommand, askGrokInlineCommand, editWithGrokCommand, explainCodeCommand, reviewCodeCommand);
}

export function deactivate() {}