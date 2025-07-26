
# Grok Integration - Development Guide

## Index

- [Development Setup](#development-setup)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Building the Extension](#building-the-extension)
- [Packaging for Distribution](#packaging-for-distribution)
- [Version Management](#version-management)
- [Development Workflow](#development-workflow)
- [Features (Technical)](#features-technical)
- [Chat Participant Integration](#chat-participant-integration)
- [Commands and Shortcuts](#commands-and-shortcuts)
- [Slash Commands](#slash-commands)
- [Configuration](#configuration)
- [File Structure](#file-structure)
- [Extension Manifest (packagejson)](#extension-manifest-packagejson)
- [API Integration](#api-integration)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting Development](#troubleshooting-development)
- [Contributing](#contributing)
- [Release Process](#release-process)
- [Architecture Notes](#architecture-notes)
- [Chat Participant Flow](#chat-participant-flow)
- [Context Integration](#context-integration)
- [Development Environment](#development-environment-ddev--vs-code--typescript)
- [Code Compile Instructions](#code-compile-instructions)
- [Package Instructions](#package-instructions)

A VS Code extension that integrates Grok AI into your development workflow.

## Development Setup

ddev exec npm install -g vsce
ddev exec "cd grok-integration && vsce package"


### Prerequisites
- Node.js 16+ 
- VS Code 1.102.0+
- TypeScript
- DDEV (for containerized development)

### Getting Started
1. Clone the repository:
   ```bash
   git clone https://github.com/ndestates/vscode-grok4.git
   cd vscode-grok4/grok-integration
   ```

2. Install dependencies:
   ```bash
   # Using DDEV
   ddev exec "npm install"
   
   # Or locally
   npm install
   ```

3. Compile TypeScript:
   ```bash
   # Using DDEV
   ddev exec "npm run compile"
   
   # Or locally
   npm run compile
   ```

## Building the Extension

### Packaging for Distribution

To create a VSIX package for distribution:

```bash
# Using DDEV (recommended)
cd /path/to/vscode-grok4
ddev exec "cd grok-integration && vsce package"

# Or locally (requires @vscode/vsce installed globally)

```

This will generate `grok-integration-1.0.0.vsix` (or current version) ready for installation.

### Version Management

Update version in `package.json`:
```json
{
  "version": "1.0.0"
}
```

The VSIX filename will automatically reflect the version number.

### Development Workflow

1. **Make changes** to source files in `src/`
2. **Compile**: `ddev exec "npm run compile"`
3. **Test**: Press F5 in VS Code to launch Extension Development Host
4. **Package**: ``
5. **Install**: Use Command Palette → "Extensions: Install from VSIX..."

## Features (Technical)

### Chat Participant Integration
- Registers as `@grok` in VS Code's chat panel
- Implements `vscode.chat.createChatParticipant` API
- Supports streaming responses via OpenAI SDK
- Context-aware with conversation history

### Commands and Shortcuts
- `grok-integration.askGrokInline` - `Ctrl+Shift+G` / `Cmd+Shift+G`
- `grok-integration.editWithGrok` - `Ctrl+Shift+E` / `Cmd+Shift+E`
- `grok-integration.explainCode` - Context menu
- `grok-integration.reviewCode` - Context menu

### Slash Commands
Implemented via command detection in chat participant:
- `/explain` - Code explanation mode
- `/review` - Code review mode
- `/debug` - Debugging assistance
- `/refactor` - Refactoring suggestions
- `/test` - Test generation
- `/optimize` - Performance optimization

### Configuration
Settings contributed via `package.json`:
```json
"configuration": {
  "properties": {
    "grokIntegration.apiKey": {
      "type": "string",
      "description": "Your xAI API key"
    },
    "grokIntegration.licenseKey": {
      "type": "string", 
      "default": "GI-DEMO1234-ABCD5678-EFGH9012",
      "description": "License key (Demo included)"
    }
  }
}
```

## File Structure

```
grok-integration/
├── src/
│   ├── extension.ts          # Main extension entry point
│   └── test/                 # Test files
├── out/                      # Compiled JavaScript
├── package.json              # Extension manifest
├── tsconfig.json            # TypeScript configuration
├── README.md                # User documentation
├── Development.md           # This file
├── LICENSE                  # MIT License
└── *.vsix                   # Generated packages
```

## Extension Manifest (package.json)

Key sections for VS Code extension:

### Activation
```json
"activationEvents": [],
"main": "./out/extension.js"
```

### Chat Participant
```json
"chatParticipants": [
  {
    "id": "grok-integration.grok",
    "name": "grok", 
    "description": "Ask Grok AI questions about your code",
    "isSticky": true,
    "commands": [
      {"name": "explain", "description": "Explain code in detail"},
      {"name": "review", "description": "Review code quality"},
      // ... other commands
    ]
  }
]
```

### Context Menus
```json
"menus": {
  "editor/context": [
    {
      "command": "grok-integration.explainCode",
      "when": "editorHasSelection",
      "group": "grok@1"
    }
  ]
}
```

## API Integration

### xAI Grok API
- Base URL: `https://api.x.ai/v1`
- Model: `grok-3-beta`
- Authentication: Bearer token (API key)
- Streaming: Supported via OpenAI SDK

### License System
Demo license system with hardcoded valid keys:
- `GI-DEMO1234-ABCD5678-EFGH9012` (default demo)
- Pattern: `GI-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}`

## Testing

### Manual Testing
1. Press `F5` in VS Code to launch Extension Development Host
2. In the new window, test chat participant with `@grok`
3. Test keyboard shortcuts and context menus
4. Verify API key configuration works

### Automated Testing
```bash
# Run tests
ddev exec "npm test"
```

## Deployment

### Local Installation
```bash
# Install from VSIX
code --install-extension grok-integration-1.5.9.vsix
code --uninstall-extension grok-integration-1.5.8.vsix
```

### VS Code Marketplace (Future)
1. Create publisher account
2. Package with `vsce package`
3. Publish with `vsce publish`

## Troubleshooting Development

### TypeScript Compilation Errors
- Check `tsconfig.json` configuration
- Ensure VS Code API types are correct version
- Verify OpenAI SDK compatibility

### DDEV Issues
- Ensure DDEV is running: `ddev status`
- Restart if needed: `ddev restart`
- Check Node.js version: `ddev exec "node --version"`

### Extension Loading Issues
- Check `package.json` syntax
- Verify activation events
- Review VS Code developer console for errors

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Make changes and test thoroughly
4. Update version in `package.json` if needed
5. Package and test VSIX installation
6. Submit pull request

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md` with new features
3. Test extension thoroughly
4. Package: `ddev exec "cd grok-integration && vsce package"`
5. Test VSIX installation
6. Tag release: `git tag v1.0.0`
7. Push changes and tag
8. Upload VSIX to releases

## Architecture Notes

### Chat Participant Flow
1. User types `@grok` in chat panel
2. VS Code calls chat participant handler
3. Extension checks license and API key
4. Processes slash commands if present
5. Calls xAI API with context (selected code, history)
6. Streams response back to chat panel
7. Provides follow-up suggestions

### Context Integration
- Detects selected code in active editor
- Includes file references from chat context
- Maintains conversation history
- Processes workspace context for better responses

---

**Development Environment: DDEV + VS Code + TypeScript**

# Development Guide

## Code Compile Instructions
- Compile TypeScript using DDEV: `ddev exec "npm run compile"`
- Compile TypeScript locally: `npm run compile`

## Package Instructions
- Package using DDEV: `ddev exec "cd grok-integration && vsce package"`
