# Grok AI Integration for VS Code

Bring the power of Grok AI directly into your VS Code editor! Chat with Grok, get code explanations, reviews, and suggestions without leaving your development environment.

## Version History
- 1.8.3: The default model has been changed to `grok-code-fast-1` for improved performance and efficiency.
- 1.8.0: Includes amendments to the workspace export functionality. Key changes:
  - Enhanced export options for workspace configurations.
  - Improved handling of custom settings and extensions.
  - Refer to the documentation for detailed guidance on using the new export features.
- 1.7.2: Includes minor bugfixes. 

## 🚀 Major Update in v1.8.0

**🎯 Smart Caching System** - Performance improvements

- **⚡ 10x Faster Responses**: Instant results for repeated queries with intelligent LRU caching
- **💰 Reduce API Costs**: Avoid duplicate API calls for identical requests  
- **🎛️ Full User Control**: Configure cache size (10-1000 items), TTL (1-1440 minutes), and enable/disable
- **🔒 Privacy-First**: Only non-sensitive data cached, secrets automatically redacted
- **📊 Cache Management**: Built-in commands to view stats, clear cache, and reset settings

**📁 Workspace Export Features** - Analyze entire projects (subject to your token limits)

- **🗂️ Select Multiple Files**: Choose specific files to send to Grok for analysis.  Remember do not include files with secrets.
- **🌐 Full Workspace Export**: Export all valid files in your workspace to Grok
- **❓ Custom Workspace Queries**: Ask specific questions about your entire codebase
- **🛡️ Smart Filtering**: Automatically excludes binary files, node_modules, and sensitive data

⚠️ **Important Limits Warning**: 
- **Token Limits**: Large workspaces may exceed model token limits (default: 9000 tokens)
- **Model Capacity**: Even premium models have maximum context windows
- **Recommendation**: Start with "Select Workspace Files" for large projects
- **Solution**: Increase max tokens in settings or select fewer files if you hit limits

**⚙️ Enhanced Configuration**
- **🔧 Configurable Cache Settings**: Fine-tune performance vs freshness
- **📈 Token Estimation**: Better accuracy with configurable multipliers
- **🔄 Live Updates**: Settings changes apply immediately without restart

---

## 🚀 Update in v1.6.7

-   **🔧 Bug Fixes**: Improved stability and performanc

-   **📦 Package Optimization**: Reduced bundle size for faster installation

    ** DEFAULT MODEL CHANGE **:
    -   The default model has been changed to `grok-3-mini` for enhanced performance and compatibility.
      - This model is more efficient and provides better responses for most use cases.

-   **🔄 Dependency Updates**: Updated core dependencies for better compatibility.

The default model has been changed to grok-3-mini for enhanced performance and compatibility.
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
4. (Optional) Set your preferred Grok model in **Grok AI Integration: Model** (default: `grok-3-mini`)
5. (Optional) Adjust **Grok AI Integration: Max Tokens** for longer or shorter responses (default: 9000)
6. (Optional) Configure caching settings for optimal performance (see Configuration section)
7. You're ready to go!

### 🆕 Try the New Workspace Features!
- Press `Ctrl+Shift+P` and try "Grok: Select Workspace Files" to analyze multiple files
- Or "Grok: Ask Grok About Workspace" to ask questions about your entire project

## 🚀 How to Use New Features

### ⚡ Smart Caching - Get 10x Faster Responses!

**What is Caching?**
Caching stores your previous Grok responses in memory, so identical requests return instantly without making new API calls. This means faster responses and lower costs!

**When to Use Caching:**
- ✅ **Reviewing the same code multiple times** - Perfect for iterative development
- ✅ **Teaching or demonstrations** - Show the same code explanations quickly
- ✅ **Code analysis workflows** - Repeatedly analyzing similar patterns
- ✅ **Cost optimization** - Reduce API calls for repeated queries

**How to Use:**
1. **Enable caching** (enabled by default): Go to Settings → "Grok Integration" → Check "Enable Cache"
2. **Watch for cache hits**: Look for "📦 Using cached response" notifications
3. **Monitor performance**: Use `Ctrl+Shift+P` → "Grok: Show Cache Statistics"
4. **Clear when needed**: Use "Grok: Clear Cache" for fresh analysis

**Cache Settings Explained:**
- **Cache Max Items** (100): How many responses to remember
- **Cache TTL Minutes** (30): How long responses stay fresh
- **Enable Cache** (true): Turn caching on/off

### 📁 Workspace Export - Analyze Your Entire Project!

**What is Workspace Export?**
Instead of analyzing single files, you can now send multiple files or your entire workspace to Grok for comprehensive project-level insights!

⚠️ **Before You Start - Important Limits**:
- **Check Your Token Limit**: Go to Settings → "Grok Integration" → "Max Tokens" (default: 9000)
- **Large Projects Warning**: Full workspace export may exceed token limits for big codebases
- **Model Limitations**: Even Grok models have maximum context windows they can process
- **Best Practice**: Always start with "Select Workspace Files" to test token usage before full export
- **If Export Fails**: Reduce file count, increase max tokens setting, or break analysis into smaller chunks

**When to Use Workspace Export:**
- 🔍 **Architecture analysis** - "Explain how these components work together"
- 🐛 **Bug hunting** - "Find potential issues across my codebase"
- 📚 **Code reviews** - "Review this feature implementation across multiple files"
- 🏗️ **Refactoring planning** - "How should I restructure this code?"
- 📖 **Documentation** - "Generate documentation for this module"

**Three Ways to Use:**

#### 1. Select Specific Files (Recommended)
```
1. Press Ctrl+Shift+P
2. Type "Grok: Select Workspace Files"
3. Choose files you want to analyze (Ctrl/Cmd+click for multiple)
4. Grok analyzes only selected files
```
**Best for:** Focused analysis of related components

#### 2. Export Entire Workspace
```
1. Press Ctrl+Shift+P  
2. Type "Grok: Export All Workspace Files"
3. ⚠️ WARNING: May hit token limits on large projects
4. Confirm if prompted (for large projects)
5. Grok analyzes your entire codebase
```
**Best for:** Small to medium projects, overall architecture review
**⚠️ Risk:** Large projects may exceed token/model limits

#### 3. Ask Custom Questions About Workspace
```
1. Press Ctrl+Shift+P
2. Type "Grok: Ask Grok About Workspace"  
3. ⚠️ WARNING: Analyzes entire workspace - check token limits first
4. Enter your question (e.g., "Find security vulnerabilities")
5. Grok analyzes entire workspace with your specific question
```
**Best for:** Targeted project-wide queries on smaller codebases
**⚠️ Risk:** May hit limits with large projects

**Example Questions for Workspace Analysis:**
- "Explain the overall architecture of this project"
- "Find potential security vulnerabilities" 
- "Identify code duplication and suggest improvements"
- "How do these React components interact with each other?"
- "Review error handling across the entire application"
- "Generate a summary of what this project does"

**Smart Filtering:**
The extension automatically excludes:
- Binary files (images, executables)
- `node_modules` and dependency folders
- `.git` and version control files
- Large generated files
- Files with invalid extensions

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

### 🆕 Workspace Analysis (v1.7.1)
- **Select Workspace Files** - Choose multiple files for targeted analysis
- **Export All Workspace Files** - Send your entire project to Grok for comprehensive review
- **Ask Grok About Workspace** - Custom queries about your codebase architecture, patterns, and issues

### ⚡ Smart Caching (v1.7.1)
- **Instant Responses** - Cached results return immediately with "📦 Using cached response" notification
- **Automatic Expiration** - Configurable TTL ensures fresh responses when needed
- **Memory Efficient** - LRU eviction keeps memory usage optimal
- **Cache Commands** - View stats, clear cache, or reset to defaults

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

### Code Analysis Commands
- **Grok: Ask About Selected Code** - Get AI insights about your code
- **Grok: Open Chat** - Start a conversation with Grok
- **Grok: Edit Code** - Use Grok to modify your code
- **Grok: Explain Selected Code** - Get detailed explanations
- **Grok: Review Selected Code** - Code quality analysis
- **Grok: Suggest Improvements** - Get AI-powered code suggestions
- **Grok: Propose Security Fix** - Analyze for vulnerabilities and get fixes

### 🆕 Workspace Commands (v1.7.1)
- **Grok: Select Workspace Files** - Choose specific files to export to Grok
- **Grok: Export All Workspace Files** - Send entire workspace for analysis
- **Grok: Ask Grok About Workspace** - Custom questions about your project

### 🆕 Cache Management (v1.7.1)
- **Grok: Show Cache Statistics** - View current cache usage and settings
- **Grok: Clear Cache** - Force fresh API calls by clearing cached responses  
- **Grok: Reset Cache Settings** - Return cache configuration to defaults

### Utility Commands
- **Grok: Test API Connection** - Verify your API key works
- **Grok: Show Token Count** - Check estimated token usage

## ⚙️ Configuration

Configure the extension in VS Code Settings (`Ctrl+,` or `Cmd+,`):

### Essential Settings
- **`grokIntegration.apiKey`** - Your xAI API key (required)
- **`grokIntegration.model`** - Grok model to use (default: `grok-3-mini`)
- **`grokIntegration.maxTokens`** - Maximum tokens per request (default: 9000)

### 🆕 Caching Settings (v1.7.1)
- **`grokIntegration.enableCache`** - Enable/disable response caching (default: `true`)
- **`grokIntegration.cacheMaxItems`** - Max cached responses: 10-1000 (default: `100`)
- **`grokIntegration.cacheTtlMinutes`** - Cache validity: 1-1440 minutes (default: `30`)
- **`grokIntegration.tokenMultiplier`** - Token estimation accuracy: 1.0-2.0 (default: `1.1`)

### Performance Tuning
**For Better Performance (more caching):**
```json
{
  "grokIntegration.enableCache": true,
  "grokIntegration.cacheMaxItems": 200,
  "grokIntegration.cacheTtlMinutes": 60
}
```

**For Always Fresh Responses (less caching):**
```json
{
  "grokIntegration.enableCache": true,
  "grokIntegration.cacheMaxItems": 50,
  "grokIntegration.cacheTtlMinutes": 5
}
```

**To Disable Caching:**
```json
{
  "grokIntegration.enableCache": false
}
```

## 💡 Practical Examples

### 🔄 Caching Workflow Example
```
Scenario: You're refactoring a function and want to review it multiple times

1. Select your function code
2. Right-click → "Grok: Review Selected Code" 
3. First time: API call made, response cached
4. Make small changes to the function
5. Select same code → Right-click → "Grok: Review Selected Code"
6. Second time: "📦 Using cached response" - instant result!
7. When you've made significant changes: Ctrl+Shift+P → "Grok: Clear Cache"
8. Now next analysis will be fresh with your changes
```

### 📁 Workspace Export Examples

#### Example 1: React Component Analysis
```
Goal: Understand how components in a React app work together

1. Ctrl+Shift+P → "Grok: Select Workspace Files"
2. Select: src/components/Header.tsx, src/components/Sidebar.tsx, src/App.tsx
3. Grok analyzes the selected components
4. Ask: "How do these components interact and pass data?"
```

#### Example 2: Security Audit
```
Goal: Find security issues across your entire project

1. Ctrl+Shift+P → "Grok: Ask Grok About Workspace" 
2. Enter: "Perform a security audit and find potential vulnerabilities"
3. Grok scans entire workspace for security issues
4. Get comprehensive security report
```

#### Example 3: Bug Investigation
```
Goal: Find the cause of a bug that spans multiple files

1. Ctrl+Shift+P → "Grok: Select Workspace Files"
2. Select files related to the problematic feature
3. Ask: "I'm getting error X when doing Y. Help me find the root cause."
4. Grok analyzes the interconnections and suggests fixes
```

### ⚡ Performance Tips
- **Use caching** for iterative development (same code, multiple reviews)
- **Select specific files** rather than full workspace export for focused analysis  
- **Clear cache** when you've made significant code changes
- **Increase cache TTL** (60+ minutes) if you rarely change code
- **Decrease cache TTL** (5-10 minutes) during active development

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

## 📝 Advanced Usage Tips

### General Usage
1. **Select code** before using context menu commands for best results
2. **Use specific prompts** in chat for more targeted assistance
3. **Attach files with `#file:`** to give Grok more context for complex questions
4. **Check token count** for large code selections to manage API usage
5. **Test your connection** if you experience issues

### 🆕 Workspace Analysis Tips (v1.7.1)
6. **⚠️ Check token limits first**: Use "Show Token Count" before workspace export
7. **Start small**: Use "Select Workspace Files" before trying full workspace export
8. **Be specific with questions**: Instead of "analyze this", try "find performance bottlenecks in these API endpoints"
9. **Group related files**: Select files that work together (e.g., controller + model + view)
10. **⚠️ Watch token limits**: Large workspaces may hit token limits - select key files instead
11. **Increase max tokens if needed**: Go to Settings → "Grok Integration" → "Max Tokens"
12. **Use for code reviews**: Perfect for reviewing feature branches with multiple changed files

### 🆕 Caching Best Practices (v1.7.1)  
13. **Recognize cache hits**: Look for "📦 Using cached response" to see when caching helps
14. **Strategic cache clearing**: Clear cache after major code changes for accurate analysis
15. **Tune TTL for your workflow**: Short TTL (5-10 min) for active development, longer (60+ min) for stable code
16. **Monitor cache stats**: Use "Show Cache Statistics" to optimize cache size for your usage patterns
17. **Combine with workspace features**: Cache works great with workspace export for repeated project analysis

### 🎯 Specific Use Cases

**For Bug Fixing:**
- Select files related to the bug + use caching for repeated analysis
- Try: "Grok: Ask Grok About Workspace" → "Find the cause of [specific error]"

**For Code Reviews:**
- Export changed files in a PR/branch 
- Ask: "Review these changes for best practices and potential issues"

**For Learning:**
- Enable caching, then repeatedly ask questions about the same code
- Perfect for understanding complex algorithms or patterns

**For Refactoring:**
- Select target files + ask for refactoring suggestions
- Use cache to quickly re-analyze after small changes

## 🐛 Troubleshooting

### Connection Issues
- **No response from Grok**: Check your API key in settings
- **Rate limit errors**: Wait a minute between requests or check cache settings
- **Connection issues**: Use "Test API Connection" command to verify setup

### Performance Issues  
- **Slow responses**: Check "Show Cache Statistics" - you may need to adjust cache settings
- **High memory usage**: Reduce `cacheMaxItems` or `cacheTtlMinutes` in settings
- **Stale responses**: Clear cache manually or reduce `cacheTtlMinutes` for fresher results

### Token & Content Issues
- **Token limit warnings**: Select smaller code sections, increase max tokens, or use "Proceed Anyway"
- **⚠️ Workspace export too large**: Use "Select Workspace Files" instead of exporting everything
- **⚠️ Model capacity exceeded**: Break large analysis into smaller chunks or increase token limit
- **Missing files in workspace export**: Check that files have valid extensions and aren't excluded
- **⚠️ Before full workspace export**: Always test with a few files first to estimate token usage

### 🆕 Cache Troubleshooting (v1.7.1)
- **Cache not working**: Ensure `enableCache` is `true` and you're making identical requests
- **Outdated cached responses**: Use "Clear Cache" command or reduce TTL setting
- **Cache stats show 0 items**: Caching may be disabled or all entries have expired

## 📄 License

See LICENSE file for details.

---

Happy coding with Grok! 🚀
