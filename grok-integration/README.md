# Grok Integration

A VS Code extension that integrates Grok AI into your development workflow.

## Installation

### Option 1: Install from VSIX file (Current)
1. Build the extension by running `vsce package` in the project directory
2. This creates a `grok-integration-0.0.1.vsix` file
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

- Ask Grok AI questions directly from VS Code
- Get AI-powered assistance with your code
- Seamless integration with the xAI API

## Requirements

- A valid xAI API key

## Extension Settings

This extension contributes the following settings:

* `grok.apiKey`: Your xAI API key for accessing Grok

## Setup

### 1. Get your xAI API Key
1. Go to https://platform.x.ai/
2. Sign in with your X (Twitter) account
3. Navigate to the API section
4. Create or copy your API key

### 2. Configure the Extension
1. Open VS Code Settings:
   - **Windows/Linux**: `Ctrl + ,`
   - **macOS**: `Cmd + ,`
   - Or go to `File > Preferences > Settings`
2. Search for "grok" in the settings search bar
3. Find "Grok: Api Key" setting
4. Paste your xAI API key into the text field

**Alternative method:**
1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Preferences: Open Settings (JSON)"
3. Add this line to your settings.json:
   ```json
   "grok.apiKey": "your-xai-api-key-here"
   ```

## Usage

1. Use the "Ask Grok about Selected Code" command from the Command Palette
2. Select code in your editor first, then run the command
3. Enter your question about the selected code
4. View Grok's response in a new panel

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
