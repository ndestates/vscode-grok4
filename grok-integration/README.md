# Grok Integration for VS Code

Bring the power of Grok AI directly into your VS Code editor! Chat with Grok, get code explanations, reviews, and suggestions without leaving your development environment.

## 🚀 New in v1.4.9

- 🧠 **Updated Model**: Now using the latest `grok-4-0709` model for improved performance and responses
- 🛡️ **Streamlined Experience**: Simplified setup with direct API key configuration
- 🔧 **Rate Limiting**: Prevents more than 30 Grok API calls per minute to avoid accidental overuse and improve stability
- 🧠 **Higher max_tokens**: Grok API calls now use up to 9000 tokens for longer, more complete answers
- 🛡️ **Safer Error Handling**: Improved error messages and handling for unknown errors and API/network issues
- 🛠️ **Modernized Codebase**: Refactored for maintainability and future features
- 📝 **README & Docs Updated**: Installation, build, and usage instructions improved for ddev and VSIX workflows

---

## 🚀 Quick Start

### 1. Install the Extension
- Open VS Code
- Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`)
- Search for "Grok Integration"
- Click "Install"
- Restart VS Code

### 2. Get Your xAI API Key
1. Visit [https://platform.x.ai/](https://platform.x.ai/)
2. Sign in with your X (Twitter) account
3. Navigate to the API section
4. Copy your API key

### 3. Configure the Extension
1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "Grok Integration"
3. Paste your API key in the "Api Key" field
4. You're ready to go!

## 💬 Using Grok Chat

Type `@grok` in any VS Code chat window to start chatting with Grok AI:

- `@grok explain this function` - Get detailed code explanations
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
3. **Check token count** for large code selections to manage API usage
4. **Test your connection** if you experience issues

## 🐛 Troubleshooting

- **No response from Grok**: Check your API key in settings
- **Rate limit errors**: Wait a minute between requests
- **Token limit warnings**: Select smaller code sections or increase max tokens
- **Connection issues**: Use "Test API Connection" command to verify setup

## 📄 License

See LICENSE file for details.

---

Happy coding with Grok! 🚀
