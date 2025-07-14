# Change Log

All notable changes to the "grok-integration" extension will be documented in this file.


## [1.2.0] - 2025-07-14
### Added
- 🔢 **Show Token Count**: New command and webview to estimate token count for selected code, accessible from the right-click context menu.
- 📂 **Upload Files for Analysis**: Now available in the right-click context menu. Supports selecting multiple files and folders (recursively) for upload and review.

### Changed
- Enhanced file upload logic to support folders and multi-file selection.
- Improved error handling and command registration.

### Fixed
- Internal code cleanup and bug fixes for context menu and command logic.

## [1.1.0] - 2025-07-14
### Added
- 📂 **Multi-file Upload**: New command to select and upload multiple files for Grok analysis and review.
- 🧮 **Token Estimation**: The extension now estimates token usage before sending requests and prompts users if the request is large.
- ⚙️ **Configurable maxTokens**: Users can set the maximum number of tokens for Grok responses in settings, with improved guidance and estimation tips.

### Changed
- Updated settings descriptions to clarify token usage and estimation.
- Improved documentation for new features and user guidance.

### Fixed
- Minor bug fixes and internal improvements for multi-file handling and user prompts.

## [Unreleased]

### Changed
- Preparing for next development cycle

## [1.0.12] - 2025-07-14
### Added
- 🛡️ **Propose Security Fix**: Right-click selected code and let Grok analyze for security vulnerabilities and propose specific code fixes.
- Command Palette and context menu integration for Explain, Review, and Security Fix.
- Improved command descriptions and emoji icons for clarity and branding.

### Changed
- Updated documentation and command palette entries for clarity.
- Minor internal improvements for command registration and error handling.

### Fixed
- Ensured all context menu commands (Explain, Review, Security Fix) appear when code is selected.

## [1.0.10] - 2025-07-13

### Improved
- **Enhanced Command Descriptions**: Made all Command Palette entries more comprehensive and user-friendly
- **Better Chat Participant UI**: Added emoji icons and detailed descriptions for all chat commands
- **Improved Settings**: Enhanced configuration descriptions with helpful links and clearer explanations
- **User Experience**: Added keyboard shortcuts in command titles and more descriptive help text

### Added
- **Comprehensive Command Titles**: All commands now include emojis and detailed descriptions
- **Keyboard Shortcut Hints**: Command titles now show associated keyboard shortcuts
- **Helpful Links**: Settings now include direct links to get API keys and support

## [1.0.9] - 2025-07-13

### Fixed
- **Response Cutoff Issue**: Increased max_tokens from 1500 to 3000 to prevent premature response truncation
- **Temperature Optimization**: Adjusted temperature from 0.5 to 0.7 for better response quality and completeness
- **Timeout Handling**: Extended timeout from 60s to 90s for longer, more comprehensive responses
- **Response Tracking**: Added full response tracking to detect and notify users of truncated responses

### Improved
- **Better User Feedback**: Added notification when responses may be truncated due to length limits
- **Enhanced Streaming**: Improved streaming response handling for more reliable content delivery

## [1.0.8] - 2025-07-13

### Added
- **Security Command**: Added new `/security` command to the chat participant for security analysis and vulnerability detection
- **Enhanced Chat Participant**: Extended command set to include security flaw detection and improvement suggestions

## [1.0.7] - 2025-07-13

### Fixed
- **Model Name Correction**: Updated to use correct Grok model name `grok-4-0709` instead of incorrect model references
- **API Connection**: Fixed 404 errors caused by incorrect model name usage

## [1.0.6] - 2025-07-13

### Changed
- **Performance Optimization**: Implemented webpack bundling for dramatically improved performance
- **Package Size Reduction**: Reduced extension size from 638KB (595 files) to 46KB (6 files) - 93% smaller
- **Faster Loading**: Bundled all dependencies into single optimized file for faster extension startup
- **Improved .vscodeignore**: Enhanced file exclusion patterns to minimize package size
- **Grok-4 Model**: Continued using latest Grok-4 model for optimal AI responses

### Technical
- Added webpack configuration for production bundling
- Updated build scripts for optimized packaging
- Enhanced development workflow with DDEV integration

## [1.0.5] - 2025-07-13

### Changed
- **Model Update**: Updated to use Grok-4 model for improved performance and responses
- **Performance Optimizations**: Reduced timeout values and optimized API calls for faster responses
- **Enhanced Error Handling**: Improved connection testing and error reporting

## [1.0.4] - 2025-07-13

### Fixed
- **Grok Panel Issue**: Fixed missing responses when explaining or reviewing selected code
- **User Experience**: Replaced chat-only interface with dedicated explanation panel
- **Real-time Status**: Added comprehensive status feedback panel with live updates

### Added
- **Dedicated Grok Panel**: New webview panel for code explanation and review with real-time status
- **Status Indicators**: Live progress updates ("Connecting...", "Grok is thinking...", "Receiving response...")
- **Enhanced UI**: Beautiful styled panel with syntax highlighting and markdown rendering
- **Error Handling**: Detailed error messages with troubleshooting guidance in dedicated panel
- **Multiple Actions**: Support for explain, review, and custom analyze requests

### Changed
- **Explain Code Command**: Now opens dedicated panel instead of redirecting to chat
- **Review Code Command**: Now opens dedicated panel instead of redirecting to chat
- **Ask Grok Command**: Improved with custom user prompts and dedicated response panel
- **Better Visual Feedback**: Enhanced loading states and response formatting

## [1.0.3] - 2025-07-13

### Fixed
- **No Response Issue**: Fixed missing responses from Grok API with enhanced error handling
- **Connection Testing**: Added automatic connection verification before API calls
- **Status Feedback**: Improved user feedback with detailed progress messages during API calls

### Added
- **Test Connection Command**: New command to manually test Grok API connectivity
- **Enhanced Progress Messages**: Real-time status updates ("Connecting...", "Grok is thinking...", "Receiving response...")
- **Detailed Error Messages**: Specific troubleshooting guidance for different API error types (401, 429, quota, network)
- **Connection Verification**: Automatic API connection test before processing requests
- **Response Validation**: Detection and handling of empty or missing API responses

### Changed
- **Better Error Handling**: Enhanced error messages with actionable troubleshooting steps
- **Improved User Experience**: Clearer status indicators and progress reporting during API calls
- **Timeout Handling**: Better handling of network timeouts and connectivity issues

## [1.0.2] - 2025-07-13

### Fixed
- **Critical License Bug**: Fixed demo license validation causing infinite loops
- **Demo Key Issue**: Updated hardcoded demo keys to match generated HMAC keys
- License validation now properly recognizes valid demo key (`GI-42C37011-2F58C780-240A39A5`)
- Improved license error handling with better user guidance
- Fixed license validation loop that prevented extension from working

### Changed
- Enhanced license prompt flow with "Use Demo Key" option for failed validations
- Updated all demo key references to use correctly generated key
- Improved error messages for license validation failures

### Added
- Enhanced `.gitignore` files to properly exclude `node_modules`, environment files, and build artifacts
- Comprehensive patterns for VS Code extension development (TypeScript cache, logs, OS files)
- Root-level `.gitignore` for workspace-wide file exclusions

## [1.0.1] - 2025-07-13

### Added
- Chat participant integration (`@grok`) for VS Code's native chat panel
- Real-time streaming responses from Grok AI
- Context awareness for selected code and conversation history
- Smart follow-up question suggestions
- Slash commands (/explain, /review, /debug, /refactor, /test, /optimize)
- Comprehensive README with usage examples and troubleshooting

### Changed
- Migrated from standalone commands to chat participant interface
- Improved user experience with native VS Code chat integration
- Enhanced error handling and user feedback
- Updated settings keys for better discoverability ("grok integration" search term)

### Fixed
- JSON syntax errors in package.json
- TypeScript compilation issues with error handling
- Settings search functionality

## [1.0.0] - 2025-07-13

### Added
- Basic chat participant functionality
- xAI API integration using OpenAI client library
- License validation system with HMAC-SHA256
- Demo license for immediate use

## [0.0.1] - 2025-07-13

### Added
- Initial extension scaffold
- Basic VS Code extension structure
- Command-based interaction (deprecated in favor of chat participant)
- TypeScript configuration and build system
- Extension manifest and activation events

### Security
- Commercial license validation system
- Secure API key storage in VS Code settings