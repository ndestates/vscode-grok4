# Change Log

All notable changes to the "grok-integration" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Improved documentation with development build instructions

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