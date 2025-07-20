const path = require('path');

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'node', // vscode extensions run in a Node.js-context
  mode: 'none', // this leaves the source code as close as possible to the original

  entry: './src/extension.ts', // the entry point of this extension
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded
    // Add canvas as external to prevent webpack warnings
    canvas: 'commonjs canvas'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // Ignore optional canvas dependency
    fallback: {
      "canvas": false
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log"
  },
  // Suppress specific warnings
  ignoreWarnings: [
    {
      module: /jsdom/,
      message: /Can't resolve 'canvas'/,
    },
  ],
};

module.exports = config;
