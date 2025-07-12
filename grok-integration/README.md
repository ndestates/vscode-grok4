# Grok Integration

A VS Code extension that integrates Grok AI into your development workflow.

## Installation

### Option 1: Install from VSIX file (Current)
1. Build the extension by running `vsce package` in the project directory
2. This creates a `grok-integration-0.0.3.vsix` file
3. Open VS Code
4. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
5. Type "Extensions: Install from VSIX..."
6. Select the generated `.vsix` file
7. Restart VS Code if prompted

### Option 2: From VS Code Marketplace (Future)
Once published to the marketplace:
1. Open VS Code
2. Go to Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "Grok Integration"
4. Click Install

## Features

- **🤖 Chat Agent**: Use `@grok` in VS Code's chat panel alongside other AI agents
- **💬 Ask & Edit Experience**: 
  - **Inline Chat**: Press `Ctrl+Shift+G` (or `Cmd+Shift+G` on Mac) to quickly ask Grok questions
  - **Code Editing**: Select code and press `Ctrl+Shift+E` (or `Cmd+Shift+E` on Mac) to edit with Grok
  - **Context Menu**: Right-click selected code for "Explain", "Review", or "Edit with Grok" options
- **💬 Real-time Streaming**: Get responses as they're generated
- **🧠 Context Aware**: Maintains conversation history for better responses
- **🎯 Smart Followups**: Suggested follow-up questions for deeper exploration
- **🔧 Code Integration**: Ask about selected code or general programming questions
- **🚀 Easy Setup**: Demo license included, just add your xAI API key

### Available Commands

- **Ask Grok (Inline Chat)**: `Ctrl+Shift+G` / `Cmd+Shift+G` - Quick access to Grok chat
- **Edit with Grok**: `Ctrl+Shift+E` / `Cmd+Shift+E` - Edit selected code with Grok's help
- **Explain Code with Grok**: Right-click context menu - Get detailed code explanations
- **Review Code with Grok**: Right-click context menu - Get code review and suggestions

### Slash Commands in Chat

When using `@grok` in the chat panel, you can use these specialized commands:
- `/explain` - Get detailed code explanations
- `/review` - Code review and quality assessment
- `/debug` - Help identify and fix bugs
- `/refactor` - Suggestions for code improvements
- `/test` - Generate unit tests
- `/optimize` - Performance optimization suggestions

## Requirements

- A valid xAI API key
- **A valid license key (One-time purchase: $50 USD)**

## Licensing

This extension requires a valid license key for activation. Each license supports one user and includes:
- ✅ Unlimited usage of Grok integration features
- ✅ All future updates within the major version
- ✅ Email support

### Purchase License
Use the command "Purchase License" from the Command Palette or visit our website.

## Extension Settings

This extension contributes the following settings:

* `grokIntegration.apiKey`: Your xAI API key for accessing Grok
* `grokIntegration.licenseKey`: Your license key (Demo key included by default)

## Setup

### Step 1: Install Extension
The extension comes with a **demo license key pre-installed** - no license setup needed!

### Step 2: Get Your xAI API Key
1. Visit: https://platform.x.ai/
2. Sign in with your X (Twitter) account
3. Navigate to the API section
4. Copy your API key

### Step 3: Enter Your API Key
1. **Open Settings**: Press `Ctrl+,` (Windows/Linux) or `Cmd+,` (Mac)
2. **Search**: Type "grok integration" in the search box
3. **Enter API Key**: Paste your xAI API key in "Grok Integration: Api Key" field

### Step 4: Start Using Grok
1. **Open Chat Panel**: Press `Ctrl+Alt+I` (Windows/Linux) or `Cmd+Alt+I` (Mac)
2. **Type**: `@grok Hello!` and press Enter
3. **Success!** You should see Grok respond in the chat

## How to Use

### 🎯 **Primary Method: Chat Panel (Recommended)**
1. **Open Chat Panel**: Press `Ctrl+Alt+I` (Windows/Linux) or `Cmd+Alt+I` (Mac)
2. **Type**: `@grok` followed by your question
3. **Examples**:
   - `@grok How do I optimize this React component?`
   - `@grok Explain async/await in JavaScript`
   - `@grok What's wrong with my Python code?`
4. **Get Response**: Streaming response with smart followup suggestions

### 🔧 **Alternative: Command Method**
1. **Select some code** in any file
2. **Open Command Palette**: Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
3. **Type**: "Ask Grok about Selected Code" and press Enter
4. **Enter your question** and view response in a panel

### Other Useful Commands
- **"Check License Status"** - See if your license is working
- **"Enter License Key"** - Manually enter a license key
- **"Purchase License"** - Get a new license or demo key

## Troubleshooting

### "Please set your xAI API key" error
1. Press `Ctrl+,` (Windows/Linux) or `Cmd+,` (Mac)
2. Search "grok integration"
3. Paste your API key in "Grok Integration: Api Key"

### Settings not showing up when searching "grok"
1. Try searching "grok integration" instead
2. Or scroll down to find "Grok Integration" section

### "No text selected" error
1. First select/highlight some code in your editor
2. Then run "Ask Grok about Selected Code"

### Still not working?
1. Press `Ctrl+Shift+P` → "Check License Status"
2. Extension comes with demo license pre-installed
3. Restart VS Code

## Known Issues

- None currently reported

## Release Notes

### 0.0.2
- Added installation instructions
- Added LICENSE file
- Added repository information
- Updated documentation

### 0.0.1
- Initial release with basic Grok integration
- Command to ask Grok about selected code
- Configuration for xAI API key

## Contributing

Found a bug or want to contribute? Visit our [GitHub repository](https://github.com/ndestates/vscode-grok4).

## License

This extension is licensed under the [MIT License](LICENSE).

**Enjoy using Grok Integration!**
