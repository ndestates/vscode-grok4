# Grok Integration for VS Code

Bring the power of Grok AI directly into your VS Code editor! Chat with Grok, get code explanations, reviews, and suggestions without leaving your development environment.

## 🚀 New in v1.5.2

-   **🧠 Enhanced Chat Context**: Attach multiple files to your chat prompts using `#file:` for project-aware answers and multi-file code edits.
-   **🔒 User Consent**: The extension now asks for your permission before sending file contents to the API, putting you in control.
-   **⚡ Token Limit Override**: Exceeding the token limit? A new dialog lets you proceed with large requests on a case-by-case basis.
-   **💡 Suggest Improvements**: A new right-click command to get quick, actionable suggestions for your selected code.
-   **🎯 Direct & Professional AI**: The AI is now instructed to provide concise, to-the-point answers without conversational filler.

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
