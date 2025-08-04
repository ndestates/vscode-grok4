import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

// Import functions to test - we'll need to export them from extension.ts
import { 
	parseGrokCodeChanges, 
	redactSecrets, 
	sanitizeForJson, 
	estimateTokens,
	isValidExtension,
	generateCacheKey
} from '../extension';

suite('Grok Extension Test Suite', () => {
	vscode.window.showInformationMessage('Starting Grok Extension tests...');

	suite('parseGrokCodeChanges', () => {
		test('should parse basic file changes', () => {
			const markdown = `
--- FILE: src/test.ts ---
\`\`\`typescript
function hello() {
  console.log('Hello World');
}
\`\`\`
			`;

			const result = parseGrokCodeChanges(markdown);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].file, 'src/test.ts');
			assert.strictEqual(result[0].code, `function hello() {
  console.log('Hello World');
}`);
			assert.strictEqual(result[0].action, 'replace'); // default action
		});

		test('should parse file changes with action indicators', () => {
			const markdown = `
--- FILE: src/component.tsx ---
action: append
\`\`\`tsx
export default MyComponent;
\`\`\`
			`;

			const result = parseGrokCodeChanges(markdown);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].file, 'src/component.tsx');
			assert.strictEqual(result[0].action, 'append');
			assert.strictEqual(result[0].code, 'export default MyComponent;');
		});

		test('should parse file changes with line ranges', () => {
			const markdown = `
--- FILE: utils/helpers.js ---
action: replace
lines: 10-15
\`\`\`javascript
function updatedFunction() {
  return 'updated';
}
\`\`\`
			`;

			const result = parseGrokCodeChanges(markdown);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].file, 'utils/helpers.js');
			assert.strictEqual(result[0].action, 'replace');
			assert.strictEqual(result[0].lineStart, 10);
			assert.strictEqual(result[0].lineEnd, 15);
		});

		test('should parse multiple file changes', () => {
			const markdown = `
--- FILE: src/file1.ts ---
\`\`\`typescript
const a = 1;
\`\`\`

--- FILE: src/file2.ts ---
action: insert
\`\`\`typescript
const b = 2;
\`\`\`
			`;

			const result = parseGrokCodeChanges(markdown);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].file, 'src/file1.ts');
			assert.strictEqual(result[1].file, 'src/file2.ts');
			assert.strictEqual(result[1].action, 'insert');
		});

		test('should handle empty or invalid markdown', () => {
			assert.strictEqual(parseGrokCodeChanges('').length, 0);
			assert.strictEqual(parseGrokCodeChanges('No file changes here').length, 0);
			assert.strictEqual(parseGrokCodeChanges('Just some text').length, 0);
		});
	});

	suite('redactSecrets', () => {
		test('should redact API keys', () => {
			const text = 'API_KEY=sk-abc123def456 and OPENAI_API_KEY=sk-xyz789';
			const result = redactSecrets(text);
			assert.ok(result.includes('[REDACTED]'));
			assert.ok(!result.includes('sk-abc123def456'));
			assert.ok(!result.includes('sk-xyz789'));
		});

		test('should redact passwords', () => {
			const text = 'password=secret123 and PASSWORD="mypassword"';
			const result = redactSecrets(text);
			assert.ok(result.includes('[REDACTED]'));
			assert.ok(!result.includes('secret123'));
			assert.ok(!result.includes('mypassword'));
		});

		test('should redact tokens', () => {
			const text = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.OpOSSw7e485LOP5PrzScxHb7SR6sAOMNkRP1oO105lX';
			const result = redactSecrets(text);
			assert.ok(result.includes('[REDACTED]'));
			assert.ok(!result.includes('eyJhbGciOiJIUzI1NiJ9'));
		});

		test('should preserve normal text', () => {
			const text = 'function test() { return "hello world"; }';
			const result = redactSecrets(text);
			assert.strictEqual(result, text);
		});
	});

	suite('sanitizeForJson', () => {
		test('should handle normal strings', () => {
			const text = 'Hello world';
			assert.strictEqual(sanitizeForJson(text), text);
		});

		test('should remove null characters', () => {
			const text = 'Hello\x00world';
			const result = sanitizeForJson(text);
			assert.strictEqual(result, 'Helloworld');
		});

		test('should handle unicode characters', () => {
			const text = 'Hello 🌍 world';
			const result = sanitizeForJson(text);
			assert.ok(result.includes('Hello'));
			assert.ok(result.includes('world'));
		});

		test('should handle empty strings', () => {
			assert.strictEqual(sanitizeForJson(''), '');
		});
	});

	suite('estimateTokens', () => {
		test('should estimate tokens for simple text', async () => {
			const text = 'Hello world';
			const tokens = await estimateTokens(text);
			assert.ok(tokens > 0);
			assert.ok(tokens < 10); // Should be small for simple text
		});

		test('should estimate more tokens for longer text', async () => {
			const shortText = 'Hello';
			const longText = 'Hello world this is a much longer text that should have more tokens than the short one';
			
			const shortTokens = await estimateTokens(shortText);
			const longTokens = await estimateTokens(longText);
			
			assert.ok(longTokens > shortTokens);
		});

		test('should handle empty strings', async () => {
			const tokens = await estimateTokens('');
			assert.strictEqual(tokens, 0);
		});
	});

	suite('isValidExtension', () => {
		test('should accept valid code file extensions', () => {
			const validFiles = [
				vscode.Uri.file('/path/to/file.ts'),
				vscode.Uri.file('/path/to/file.js'),
				vscode.Uri.file('/path/to/file.tsx'),
				vscode.Uri.file('/path/to/file.jsx'),
				vscode.Uri.file('/path/to/file.py'),
				vscode.Uri.file('/path/to/file.java'),
				vscode.Uri.file('/path/to/file.go'),
				vscode.Uri.file('/path/to/file.rs'),
				vscode.Uri.file('/path/to/file.md'),
				vscode.Uri.file('/path/to/file.json')
			];

			validFiles.forEach(uri => {
				assert.ok(isValidExtension(uri), `${uri.fsPath} should be valid`);
			});
		});

		test('should reject invalid file extensions', () => {
			const invalidFiles = [
				vscode.Uri.file('/path/to/file.exe'),
				vscode.Uri.file('/path/to/file.bin'),
				vscode.Uri.file('/path/to/file.dll'),
				vscode.Uri.file('/path/to/file.so'),
				vscode.Uri.file('/path/to/image.png'),
				vscode.Uri.file('/path/to/image.jpg'),
				vscode.Uri.file('/path/to/video.mp4')
			];

			invalidFiles.forEach(uri => {
				assert.ok(!isValidExtension(uri), `${uri.fsPath} should be invalid`);
			});
		});

		test('should handle files without extensions', () => {
			const uri = vscode.Uri.file('/path/to/README');
			// Assuming README files are considered valid
			assert.ok(isValidExtension(uri));
		});
	});

	suite('generateCacheKey', () => {
		test('should generate consistent keys for same input', () => {
			const code = 'function test() {}';
			const language = 'typescript';
			const action = 'explain';

			const key1 = generateCacheKey(code, language, action);
			const key2 = generateCacheKey(code, language, action);

			assert.strictEqual(key1, key2);
		});

		test('should generate different keys for different inputs', () => {
			const code1 = 'function test1() {}';
			const code2 = 'function test2() {}';
			const language = 'typescript';
			const action = 'explain';

			const key1 = generateCacheKey(code1, language, action);
			const key2 = generateCacheKey(code2, language, action);

			assert.notStrictEqual(key1, key2);
		});

		test('should generate different keys for different actions', () => {
			const code = 'function test() {}';
			const language = 'typescript';

			const key1 = generateCacheKey(code, language, 'explain');
			const key2 = generateCacheKey(code, language, 'review');

			assert.notStrictEqual(key1, key2);
		});
	});

	suite('Integration Tests', () => {
		test('should handle workspace file validation', () => {
			// Test that workspace file filtering works correctly
			const testFiles = [
				'src/index.ts',
				'node_modules/package/index.js',
				'.git/config',
				'README.md',
				'package.json',
				'image.png'
			];

			const validFiles = testFiles.filter(file => {
				const uri = vscode.Uri.file(file);
				return isValidExtension(uri) && 
					   !file.includes('node_modules') && 
					   !file.startsWith('.git');
			});

			assert.strictEqual(validFiles.length, 3); // src/index.ts, README.md, package.json
		});

		test('should handle code change parsing edge cases', () => {
			const edgeCaseMarkdown = `
Some explanation text here.

--- FILE: weird/path with spaces.ts ---
action: REPLACE
Lines: 5
\`\`\`typescript
// Fixed code
\`\`\`

More text after the code block.

--- FILE: another-file.js ---
\`\`\`javascript
console.log('test');
\`\`\`
			`;

			const result = parseGrokCodeChanges(edgeCaseMarkdown);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].file, 'weird/path with spaces.ts');
			assert.strictEqual(result[0].action, 'replace'); // Should normalize to lowercase
			assert.strictEqual(result[1].file, 'another-file.js');
		});
	});

	suite('Error Handling Tests', () => {
		test('should handle malformed markdown gracefully', () => {
			const malformedMarkdown = `
--- FILE: test.ts ---
\`\`\`typescript
function broken(
// Missing closing brace and backticks
			`;

			const result = parseGrokCodeChanges(malformedMarkdown);
			// Should not throw, should return empty or handle gracefully
			assert.ok(Array.isArray(result));
		});

		test('should handle extremely long file names', () => {
			const longFileName = 'a'.repeat(1000) + '.ts';
			const markdown = `
--- FILE: ${longFileName} ---
\`\`\`typescript
const test = 1;
\`\`\`
			`;

			const result = parseGrokCodeChanges(markdown);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].file, longFileName);
		});

		test('should handle special characters in file paths', () => {
			const specialPath = 'src/files-with-special-chars!@#$%.ts';
			const markdown = `
--- FILE: ${specialPath} ---
\`\`\`typescript
const test = 1;
\`\`\`
			`;

			const result = parseGrokCodeChanges(markdown);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].file, specialPath);
		});
	});
});
