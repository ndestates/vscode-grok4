import * as vscode from 'vscode';

/**
 * Mock utilities for testing VS Code extension functionality
 */

export class MockWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
    private config: { [key: string]: any } = {
        'enableCache': true,
        'cacheMaxItems': 100,
        'cacheTtlMinutes': 30,
        'tokenMultiplier': 1.1,
        'apiKey': 'test-key',
        'model': 'grok-3-mini',
        'maxTokens': 9000
    };

    get<T>(section: string): T | undefined;
    get<T>(section: string, defaultValue: T): T;
    get<T>(section: string, defaultValue?: T): T | undefined {
        return this.config[section] !== undefined ? this.config[section] : defaultValue;
    }

    has(section: string): boolean {
        return this.config.hasOwnProperty(section);
    }

    inspect<T>(section: string): { 
        key: string; 
        defaultValue?: T; 
        globalValue?: T; 
        workspaceValue?: T; 
        workspaceFolderValue?: T; 
    } | undefined {
        return undefined;
    }

    update(section: string, value: any, configurationTarget?: vscode.ConfigurationTarget | boolean, overrideInLanguage?: boolean): Thenable<void> {
        this.config[section] = value;
        return Promise.resolve();
    }

    readonly [key: string]: any;
}

export function createMockUri(path: string): vscode.Uri {
    return vscode.Uri.file(path);
}

export function createMockTextDocument(content: string, languageId: string = 'typescript'): Partial<vscode.TextDocument> {
    const lines = content.split('\n');
    return {
        lineCount: lines.length,
        getText: (range?: vscode.Range) => {
            if (!range) return content;
            return content; // Simplified for mock
        },
        lineAt: (line: number) => ({
            text: lines[line] || '',
            lineNumber: line,
            range: new vscode.Range(line, 0, line, (lines[line] || '').length),
            isEmptyOrWhitespace: (lines[line] || '').trim().length === 0,
            firstNonWhitespaceCharacterIndex: 0,
            rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0)
        }),
        languageId
    };
}

export function setupMockVscode() {
    // Mock vscode.workspace.getConfiguration
    const originalGetConfiguration = vscode.workspace.getConfiguration;
    (vscode.workspace as any).getConfiguration = (section?: string) => {
        return new MockWorkspaceConfiguration();
    };

    return {
        restore: () => {
            (vscode.workspace as any).getConfiguration = originalGetConfiguration;
        }
    };
}
