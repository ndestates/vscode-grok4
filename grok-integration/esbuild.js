const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node14', // Adjust based on your VS Code target
  minify: true,
  sourcemap: true, // Set to true for development
}).catch(() => process.exit(1));