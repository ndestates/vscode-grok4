import * as path from 'path';
import { runCLI } from 'jest';

export function run(): Promise<void> {
    const testsRoot = path.resolve(__dirname, '..');

    const options = {
        _: [],
        $0: 'jest',
        testPathPattern: ['**/*.test.js'],
        testEnvironment: 'node',
        cwd: testsRoot,
        passWithNoTests: true,
        verbose: true,
    };

    return runCLI(options, [testsRoot]).then(({ results }) => {
        if (results.numFailedTests > 0) {
            throw new Error(`${results.numFailedTests} tests failed.`);
        }
    });
}
