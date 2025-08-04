# Grok Extension Tests

This directory contains comprehensive tests for the Grok AI Integration extension.

## Test Structure

### Test Files

- **`extension.test.ts`** - Core functionality tests
  - `parseGrokCodeChanges` - Tests for parsing Grok markdown responses
  - `redactSecrets` - Tests for secret redaction functionality
  - `sanitizeForJson` - Tests for JSON sanitization
  - `estimateTokens` - Tests for token estimation
  - `isValidExtension` - Tests for file validation
  - `generateCacheKey` - Tests for cache key generation

- **`cache.test.ts`** - Caching system tests
  - Cache configuration validation
  - Cache key generation and consistency
  - Cache operations (store/retrieve/expire)
  - LRU eviction behavior

- **`workspace.test.ts`** - Workspace export tests
  - File filtering and validation
  - Content processing and encoding
  - Token management for large workspaces
  - User interface interactions

- **`agent-mode.test.ts`** - Agent mode functionality tests
  - Code change parsing and validation
  - File operation security checks
  - Change application strategies
  - Error recovery and rollback

### Supporting Files

- **`mocks.ts`** - Mock utilities for VS Code APIs
- **`index.ts`** - Test runner configuration
- **`runTest.ts`** - Test execution script

## Running Tests

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile TypeScript:
   ```bash
   npm run compile
   ```

### Running All Tests

```bash
npm test
```

### Running Specific Test Suites

```bash
# Run only extension tests
npx mocha out/test/extension.test.js

# Run only cache tests
npx mocha out/test/cache.test.js

# Run only workspace tests
npx mocha out/test/workspace.test.js

# Run only agent mode tests
npx mocha out/test/agent-mode.test.js
```

### Watch Mode

```bash
npm run test-watch
```

## Test Coverage Areas

### 1. Security Tests
- Path traversal prevention
- Secret redaction
- Input validation and sanitization
- File permission handling

### 2. Performance Tests
- Cache efficiency
- Memory usage limits
- Token estimation accuracy
- Large file handling

### 3. Error Handling Tests
- Malformed input handling
- Network error recovery
- File system error handling
- User cancellation scenarios

### 4. Integration Tests
- End-to-end workflow testing
- VS Code API integration
- Settings synchronization
- Command execution

## Key Test Scenarios

### parseGrokCodeChanges Tests

```typescript
// Test basic file changes
const markdown = `
--- FILE: src/test.ts ---
\`\`\`typescript
function hello() {
  console.log('Hello World');
}
\`\`\`
`;

// Test action indicators
const markdownWithAction = `
--- FILE: src/component.tsx ---
action: append
\`\`\`tsx
export default MyComponent;
\`\`\`
`;

// Test line ranges
const markdownWithLines = `
--- FILE: utils/helpers.js ---
action: replace
lines: 10-15
\`\`\`javascript
function updatedFunction() {
  return 'updated';
}
\`\`\`
`;
```

### Security Tests

```typescript
// Test secret redaction
const textWithSecrets = 'API_KEY=sk-abc123def456 and PASSWORD="secret"';
const redacted = redactSecrets(textWithSecrets);
// Should not contain actual secrets

// Test path validation
const dangerousPaths = [
  '../../../etc/passwd',
  '/absolute/path/file.ts',
  'folder/../another/file.js'
];
// Should be rejected by validation
```

### Cache Tests

```typescript
// Test cache consistency
const key1 = generateCacheKey('code', 'typescript', 'explain');
const key2 = generateCacheKey('code', 'typescript', 'explain');
// Should be identical

// Test cache expiration
setToCache('test-key', 'response', 100);
// After TTL expires, should return undefined
```

## Mocking Strategy

The tests use a comprehensive mocking strategy to isolate functionality:

1. **VS Code API Mocking** - Mock workspace configuration, file system, etc.
2. **Network Mocking** - Mock API calls to avoid external dependencies
3. **File System Mocking** - Mock file operations for predictable testing
4. **Time Mocking** - Mock time-based operations for cache testing

## Best Practices

### Writing New Tests

1. **Isolation** - Each test should be independent
2. **Descriptive Names** - Test names should clearly describe what they test
3. **Edge Cases** - Include tests for boundary conditions and error cases
4. **Performance** - Test performance-critical paths
5. **Security** - Always test security-related functionality

### Test Organization

1. **Logical Grouping** - Group related tests in suites
2. **Setup/Teardown** - Use proper setup and cleanup
3. **Data-Driven** - Use parameterized tests where appropriate
4. **Documentation** - Document complex test scenarios

## Debugging Tests

### VS Code Debug Configuration

Use the provided `.vscode/launch.json` configuration to debug tests:

1. Set breakpoints in test files
2. Run "Launch Extension Tests" configuration
3. Debug normally with F5/F10/F11

### Console Output

Tests include comprehensive console output for debugging:

```bash
# Enable verbose output
npm test -- --verbose

# Run with debug information
DEBUG=* npm test
```

## Contributing

When adding new functionality:

1. **Write tests first** - Use TDD approach when possible
2. **Test edge cases** - Include error conditions and boundary cases
3. **Update documentation** - Keep this README updated
4. **Run all tests** - Ensure existing tests still pass

## Troubleshooting

### Common Issues

1. **Import Errors** - Ensure all exports are properly declared
2. **Mock Issues** - Check that VS Code APIs are properly mocked
3. **Timeout Errors** - Increase timeout for slow operations
4. **Path Issues** - Use absolute paths in test configurations

### Getting Help

1. Check VS Code extension testing documentation
2. Review existing test patterns in this codebase
3. Consult the VS Code API documentation for mock requirements
