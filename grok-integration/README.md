# Grok Integration for VS Code

Bring the power of Grok AI directly into your VS Code editor! Chat with Grok, get code explanations, reviews, and suggestions without leaving your development environment.


## 🚀 New in v1.3.0

- � **Security & Privacy Refactor**: License key is now stored in VS Code settings (not SecretStorage). All license management is configuration-based for transparency and portability.
- � **Rate Limiting**: Prevents more than 5 Grok API calls per minute to avoid accidental overuse and improve stability.
- 🧠 **Higher max_tokens**: Grok API calls now use up to 9000 tokens for longer, more complete answers.
- 🛡️ **Safer Error Handling**: Improved error messages and handling for unknown errors and API/network issues.
- 🛠️ **Modernized Codebase**: Refactored for maintainability, security, and future features. Removed legacy SecretStorage code.
- 📝 **README & Docs Updated**: Installation, build, and usage instructions improved for ddev and VSIX workflows.

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
2. Search for "grok integration"
3. Paste your API key in "Grok Integration: Api Key"

### 4. Start Using Grok!
- Open the Chat panel: `Ctrl+Alt+I` (or `Cmd+Alt+I` on Mac)
- Type: `@grok Hello!`
- Press Enter and watch Grok respond!

### 💬 Chat with Grok
Use `@grok` in the VS Code chat panel alongside other AI assistants:
- `@grok How do I optimize this React component?`
- `@grok Explain async/await in JavaScript`
- `@grok What's the best way to handle errors in Python?`

### 🔧 Quick Actions
- **Ask Questions**: `Ctrl+Shift+G` / `Cmd+Shift+G` - Instant access to Grok
- **Edit Code**: `Ctrl+Shift+E` / `Cmd+Shift+E` - Get help editing selected code
- **Upload Files**: Use the Command Palette or right-click and select "📂 Grok: Upload Files for Analysis" to send multiple files or folders for review or analysis
- **Show Token Count**: Right-click selected code and choose "🔢 Grok: Show Token Count" to estimate token usage
- **Right-click menus**: Select code and right-click for "Explain", "Review", "Security Fix", "Show Token Count", or "Upload Files for Analysis"

### 🎯 Specialized Commands
When chatting with `@grok`, use these slash commands:
- `/explain` - Get detailed code explanations
- `/review` - Code review and quality suggestions
- `/debug` - Help finding and fixing bugs
- `/refactor` - Improve code structure
- `/test` - Generate unit tests
- `/optimize` - Performance improvements

## 🎁 Features

✅ **Real-time streaming responses** - See Grok's answers as they're typed  
✅ **Context aware** - Grok understands your selected code and conversation history  
✅ **Smart follow-ups** - Get suggested next questions  
✅ **Multiple ways to interact** - Chat panel, keyboard shortcuts, or context menus  
✅ **Demo license included** - Start using immediately, no purchase required  

## 🧮 Token Usage & Limits

Grok responses are limited by the `maxTokens` setting (default: 3000). The extension estimates token usage before sending requests and will prompt you if your request is too large. You can adjust `maxTokens` in the extension settings. **Tip:** 1 token ≈ 4 characters.

## 🛠️ Troubleshooting

**"Please set your xAI API key" error?**
- Go to Settings (`Ctrl+,`), search "grok integration", add your API key

**Can't find the settings?**
- Try searching "grok integration" instead of just "grok"

**Extension not responding?**
- Press `Ctrl+Shift+P` → type "Check License Status"
- Restart VS Code if needed

**Need help?**
- The extension includes a demo license - no purchase needed to get started
- Visit our [GitHub repository](https://github.com/ndestates/vscode-grok4) for support

## � Development

### Building from Source

If you want to build the extension from source code:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ndestates/vscode-grok4.git
   cd vscode-grok4/grok-integration
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Compile TypeScript**:
   ```bash
   npm run compile
   ```

4. **Package the extension**:
   ```bash
   npm install -g vsce
   vsce package
   ```

5. **Install the generated VSIX**:
   ```bash
   code --install-extension grok-integration-*.vsix
   ```

### Development Setup

For active development:

1. Open the project in VS Code
2. Press `F5` to launch a new Extension Development Host window
3. Test your changes in the development instance
4. Use `npm run compile` to rebuild after making changes

## �📝 License

This extension includes a demo license for immediate use. For extended features, a full license is available.

---

**Made with ❤️ for developers who love AI-powered coding**
