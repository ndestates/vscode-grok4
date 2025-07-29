# Grok AI Integration for VS Code

Bring the power of Grok AI directly into your VS Code editor! Chat with Grok, get code explanations, reviews, and suggestions without leaving your development environment.

## 🚀 New in v1.6.6

-   **🐞 Minor Bug Fixes**: Various small bug fixes and stability improvements.

## 🚀 New in v1.6.2

-   **🔧 Bug Fixes**: Improved extension stability and performance
-   **📦 Package Optimization**: Reduced bundle size for faster installation
-   **🔄 Dependency Updates**: Updated core dependencies for better compatibility

## 🚀 New in v1.6.1

-   **🔧 Stability Improvements**: Enhanced error handling and logging
-   **🛠️ Code Cleanup**: Removed temporary file upload features and improved code organization
-   **📝 Documentation Updates**: Updated development guides and troubleshooting sections

## 🚀 New in v1.6.0

-   **🤖 Agent & Ask Modes**: Switch between "Agent Mode" to apply code changes directly and "Ask Mode" for Q&A.
-   **⚡ Apply Code Changes**: In Agent Mode, Grok can suggest and apply code edits across your workspace with a single click.
-   **💬 Custom Grok Panel**: A unique chat panel dedicated to your interactions with Grok.
-   **🔒 Enhanced Security & Context**: Redact secrets and attach multiple files for project-aware answers.
-   **🎨 UI Improvements**: A cleaner, more intuitive interface for a better user experience.

---

## 🚀 Quick Start

### 1. Install the Extension
- Open VS Code
- Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`)
- Search for "Grok AI Integration"
- Click "Install"
- Restart VS Code

### 2. Get Your xAI API Key
1. Visit [https://console.x.ai/](https://console.x.ai/)
2. Sign in with your X (Twitter) account
3. Navigate to the API section
4. Copy your API key (must be part of a team and have credits)

### 3. Configure the Extension
1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "Grok AI Integration"
3. Paste your API key in the **Grok AI Integration: Api Key** field
4. (Optional) Set your preferred Grok model in **Grok AI Integration: Model** (default: `grok-4-0709`)
5. (Optional) Adjust **Grok AI Integration: Max Tokens** for longer or shorter responses (default: 9000)
6. You're ready to go!

## 💬 Using Grok Chat

Type `@grok` in any VS Code chat window to start chatting with Grok AI.

### Providing Context with Files
You can provide the content of one or more files to Grok for more accurate, context-aware answers. Simply type `#file:` and select a file from the picker.

**Example:**
`@grok #file:src/extension.ts #file:package.json Please add a new command and update the version.`

### Using Slash Commands
- `@grok /review` - Comprehensive code review with suggestions
- `@grok /debug` - Help debugging issues and bugs
- `@grok /optimize` - Performance optimization recommendations
- `@grok /security` - Security analysis and vulnerability detection

## 🎯 Features

### Chat Commands
- **`@grok /explain`** - Get detailed explanations of code functionality
- **`@grok /review`** - Comprehensive code review with best practices
- **`@grok /debug`** - Expert debugging assistance
- **`@grok /refactor`** - Smart refactoring suggestions
- **`@grok /test`** - Generate unit tests with edge cases
- **`@grok /optimize`** - Performance optimization recommendations
- **`@grok /security`** - Security analysis and vulnerability detection

### Right-Click Menu Options
- **Explain Selected Code** - Get detailed explanations
- **Review Selected Code** - Quality analysis and suggestions
- **Suggest Improvements** - Get AI-powered suggestions to improve the selected code
- **Security Fix** - Analyze for vulnerabilities
- **Show Token Count** - Estimate API usage

### Keyboard Shortcuts
- **`Ctrl+Shift+G`** (`Cmd+Shift+G` on Mac) - Open Grok chat
- **`Ctrl+Shift+E`** (`Cmd+Shift+E` on Mac) - Edit selected code with Grok

## 🛠️ Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- **Grok: Ask About Selected Code** - Get AI insights about your code
- **Grok: Open Chat** - Start a conversation with Grok
- **Grok: Edit Code** - Use Grok to modify your code
- **Grok: Explain Selected Code** - Get detailed explanations
- **Grok: Review Selected Code** - Code quality analysis
- **Grok: Suggest Improvements** - Get AI-powered code suggestions
- **Grok: Test API Connection** - Verify your API key works
- **Grok: Show Token Count** - Check estimated token usage

## ⚙️ Configuration

Configure the extension in VS Code Settings:

- **`grokIntegration.apiKey`** - Your xAI API key
- **`grokIntegration.maxTokens`** - Maximum tokens per request (default: 9000)

## 🔧 Development

### Building from Source

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the extension: `npm run package`
4. Create VSIX: `npx @vscode/vsce package`

### Using with DDEV

```bash
# Start ddev environment
ddev start

# Install dependencies
ddev exec npm install

# Build the extension
ddev exec npm run package

# Create VSIX package
ddev exec npx --yes @vscode/vsce package
```

## 📝 Usage Tips

1. **Select code** before using context menu commands for best results
2. **Use specific prompts** in chat for more targeted assistance
3. **Attach files with `#file:`** to give Grok more context for complex questions.
4. **Check token count** for large code selections to manage API usage
5. **Test your connection** if you experience issues

## 🐛 Troubleshooting

- **No response from Grok**: Check your API key in settings
- **Rate limit errors**: Wait a minute between requests
- **Token limit warnings**: Select smaller code sections, increase max tokens, or use the "Proceed Anyway" option when prompted.
- **Connection issues**: Use "Test API Connection" command to verify setup

## 📄 License

See LICENSE file for details.

---

Happy coding with Grok! 🚀
