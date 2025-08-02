// Add these methods to the existing extension.ts file

/**
 * Export selected files from workspace to Grok for analysis
 */
async function exportFilesToGrok(context: vscode.ExtensionContext, analysisType: 'comments' | 'review' | 'fixes', token: vscode.CancellationToken) {
  try {
    // Get workspace files
    const workspaceFiles = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 100);
    
    if (workspaceFiles.length === 0) {
      vscode.window.showInformationMessage('No files found in workspace.');
      return;
    }

    // Let user select files
    const selectedFiles = await vscode.window.showQuickPick(
      workspaceFiles.map(file => ({
        label: vscode.workspace.asRelativePath(file),
        description: file.fsPath,
        uri: file
      })),
      {
        canPickMany: true,
        placeHolder: `Select files for ${analysisType} analysis`
      }
    );

    if (!selectedFiles || selectedFiles.length === 0) {
      return;
    }

    // Prepare file contents
    let combinedContent = '';
    let totalTokens = 0;
    const config = vscode.workspace.getConfiguration('grokIntegration');
    const maxTokens = config.get<number>('maxTokens') || 9000;

    for (const selectedFile of selectedFiles) {
      try {
        const document = await vscode.workspace.openTextDocument(selectedFile.uri);
        const content = document.getText();
        const sanitizedContent = sanitizeForJson(content);
        const redactedContent = redactSecrets(sanitizedContent);
        
        const fileTokens = await estimateTokens(redactedContent);
        if (totalTokens + fileTokens > maxTokens * 0.8) { // Reserve 20% for response
          vscode.window.showWarningMessage(`Token limit reached. Processing ${combinedContent ? 'selected' : 'first'} files only.`);
          break;
        }
        
        totalTokens += fileTokens;
        combinedContent += `\n\n--- FILE: ${selectedFile.label} ---\n${redactedContent}\n--- END FILE ---`;
      } catch (error) {
        console.error(`Failed to read file ${selectedFile.label}:`, error);
        vscode.window.showWarningMessage(`Could not read file: ${selectedFile.label}`);
      }
    }

    if (!combinedContent) {
      vscode.window.showErrorMessage('No valid file content to analyze.');
      return;
    }

    // Generate appropriate action based on analysis type
    let action: string;
    let title: string;
    
    switch (analysisType) {
      case 'comments':
        action = 'add comprehensive comments and documentation to';
        title = 'Grok Code Documentation';
        break;
      case 'review':
        action = 'perform a thorough code review of';
        title = 'Grok Code Review';
        break;
      case 'fixes':
        action = 'identify and fix bugs, security issues, and code smells in';
        title = 'Grok Code Fixes';
        break;
      default:
        action = 'analyze';
        title = 'Grok Analysis';
    }

    await showGrokPanel(context, title, combinedContent, 'multi-file', action, token);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to export files: ${errorMsg}`);
    logExtensionError(error, 'exportFilesToGrok');
  }
}

/**
 * Export workspace structure and file summaries for architectural analysis
 */
async function exportWorkspaceStructure(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  try {
    const workspaceFiles = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 500);
    
    if (workspaceFiles.length === 0) {
      vscode.window.showInformationMessage('No files found in workspace.');
      return;
    }

    // Group files by directory and type
    const fileStructure: { [key: string]: string[] } = {};
    const fileTypes: { [key: string]: number } = {};

    workspaceFiles.forEach(file => {
      const relativePath = vscode.workspace.asRelativePath(file);
      const directory = relativePath.split('/').slice(0, -1).join('/') || 'root';
      const extension = file.fsPath.split('.').pop()?.toLowerCase() || 'no-ext';
      
      if (!fileStructure[directory]) {
        fileStructure[directory] = [];
      }
      fileStructure[directory].push(relativePath);
      
      fileTypes[extension] = (fileTypes[extension] || 0) + 1;
    });

    // Create workspace summary
    let workspaceSummary = `# Workspace Structure Analysis\n\n`;
    workspaceSummary += `## File Statistics\n`;
    workspaceSummary += `Total files: ${workspaceFiles.length}\n\n`;
    workspaceSummary += `### File Types\n`;
    Object.entries(fileTypes)
      .sort(([,a], [,b]) => b - a)
      .forEach(([ext, count]) => {
        workspaceSummary += `- ${ext}: ${count} files\n`;
      });

    workspaceSummary += `\n### Directory Structure\n`;
    Object.entries(fileStructure)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([dir, files]) => {
        workspaceSummary += `\n**${dir}/** (${files.length} files)\n`;
        files.slice(0, 10).forEach(file => {
          workspaceSummary += `  - ${file.split('/').pop()}\n`;
        });
        if (files.length > 10) {
          workspaceSummary += `  - ... and ${files.length - 10} more files\n`;
        }
      });

    // Add package.json content if exists
    try {
      const packageUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'package.json');
      const packageDoc = await vscode.workspace.openTextDocument(packageUri);
      const packageContent = JSON.parse(packageDoc.getText());
      
      workspaceSummary += `\n### Package Information\n`;
      workspaceSummary += `- Name: ${packageContent.name || 'Unknown'}\n`;
      workspaceSummary += `- Version: ${packageContent.version || 'Unknown'}\n`;
      if (packageContent.description) {
        workspaceSummary += `- Description: ${packageContent.description}\n`;
      }
      if (packageContent.dependencies) {
        workspaceSummary += `- Dependencies: ${Object.keys(packageContent.dependencies).length}\n`;
      }
      if (packageContent.devDependencies) {
        workspaceSummary += `- Dev Dependencies: ${Object.keys(packageContent.devDependencies).length}\n`;
      }
    } catch {
      // package.json not found or invalid, skip
    }

    await showGrokPanel(
      context, 
      'Workspace Architecture Analysis', 
      workspaceSummary, 
      'markdown', 
      'analyze the architecture and structure of this workspace, suggest improvements, and identify potential issues', 
      token
    );

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to export workspace structure: ${errorMsg}`);
    logExtensionError(error, 'exportWorkspaceStructure');
  }
}

/**
 * Export git diff for code review
 */
async function exportGitDiffForReview(context: vscode.ExtensionContext, token: vscode.CancellationToken) {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found.');
      return;
    }

    // Check if git extension is available
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) {
      vscode.window.showErrorMessage('Git extension not found.');
      return;
    }

    const git = gitExtension.exports.getAPI(1);
    const repository = git.repositories[0];
    
    if (!repository) {
      vscode.window.showErrorMessage('No git repository found in workspace.');
      return;
    }

    // Get staged and unstaged changes
    const changes = repository.state.workingTreeChanges.concat(repository.state.indexChanges);
    
    if (changes.length === 0) {
      vscode.window.showInformationMessage('No git changes found to review.');
      return;
    }

    let diffContent = '# Git Changes Review\n\n';
    diffContent += `## Changed Files (${changes.length})\n\n`;

    for (const change of changes.slice(0, 10)) { // Limit to 10 files
      const uri = change.uri;
      const relativePath = vscode.workspace.asRelativePath(uri);
      
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        const content = document.getText();
        const sanitizedContent = sanitizeForJson(content);
        const redactedContent = redactSecrets(sanitizedContent);
        
        diffContent += `### ${relativePath} (${change.status})\n\n`;
        diffContent += '```' + document.languageId + '\n';
        diffContent += redactedContent.substring(0, 2000); // Limit content per file
        if (redactedContent.length > 2000) {
          diffContent += '\n... (content truncated)\n';
        }
        diffContent += '\n```\n\n';
      } catch (error) {
        diffContent += `### ${relativePath} (${change.status})\n`;
        diffContent += `*Could not read file content: ${error instanceof Error ? error.message : String(error)}*\n\n`;
      }
    }

    if (changes.length > 10) {
      diffContent += `*... and ${changes.length - 10} more changed files*\n\n`;
    }

    await showGrokPanel(
      context,
      'Git Changes Review',
      diffContent,
      'markdown',
      'review these git changes for code quality, potential bugs, security issues, and suggest improvements',
      token
    );

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to export git diff: ${errorMsg}`);
    logExtensionError(error, 'exportGitDiffForReview');
  }
}

/**
 * Batch export multiple files with consent dialog
 */
async function batchExportFiles(context: vscode.ExtensionContext, fileUris: vscode.Uri[], analysisType: string, token: vscode.CancellationToken) {
  if (!fileUris || fileUris.length === 0) {
    vscode.window.showErrorMessage('No files selected for export.');
    return;
  }

  // Show consent dialog for multiple files
  const fileList = fileUris.slice(0, 5)
    .map(uri => `• ${vscode.workspace.asRelativePath(uri)}`)
    .join('\n');
  const extraFiles = fileUris.length > 5 ? `\n... and ${fileUris.length - 5} more files` : '';
  
  const consent = await vscode.window.showWarningMessage(
    `Export ${fileUris.length} files to Grok for ${analysisType}?\n\nFiles:\n${fileList}${extraFiles}\n\nNote: File contents will be sent to xAI API with automatic data redaction.`,
    { modal: true },
    'Export Files',
    'Cancel'
  );

  if (consent !== 'Export Files') {
    return;
  }

  // Process files
  let combinedContent = '';
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const maxTokens = config.get<number>('maxTokens') || 9000;
  let totalTokens = 0;
  let processedFiles = 0;

  for (const uri of fileUris) {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();
      const sanitizedContent = sanitizeForJson(content);
      const redactedContent = redactSecrets(sanitizedContent);
      
      const fileTokens = await estimateTokens(redactedContent);
      if (totalTokens + fileTokens > maxTokens * 0.8) {
        vscode.window.showWarningMessage(`Token limit reached. Processing first ${processedFiles} files only.`);
        break;
      }
      
      totalTokens += fileTokens;
      processedFiles++;
      
      const relativePath = vscode.workspace.asRelativePath(uri);
      combinedContent += `\n\n--- FILE: ${relativePath} ---\n${redactedContent}\n--- END FILE ---`;
    } catch (error) {
      console.error(`Failed to process file ${uri.fsPath}:`, error);
    }
  }

  if (!combinedContent) {
    vscode.window.showErrorMessage('No valid file content to export.');
    return;
  }

  await showGrokPanel(
    context,
    `Batch Export - ${analysisType}`,
    combinedContent,
    'multi-file',
    analysisType,
    token
  );
}