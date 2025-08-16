// Updated estimateTokens function with configurable multiplier
async function estimateTokens(text: string, files: string[] = []): Promise<number> {
  // Input validation
  if (typeof text !== 'string') {
    return 0;
  }
  
  if (text.length === 0) {
    return 0;
  }
  
  // Validate files array
  if (!Array.isArray(files)) {
    files = [];
  }
  
  const config = vscode.workspace.getConfiguration('grokIntegration');
  const multiplier = Math.max(1.0, Math.min(2.0, config.get<number>('tokenMultiplier') || 1.1)); // Clamp between 1.0 and 2.0
  
  try {
    // Improved token estimation using more accurate word counting
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    let total = Math.ceil(words.length * multiplier);
    
    // Add tokens for special characters and punctuation (rough estimate)
    const specialChars = (text.match(/[^\w\s]/g) || []).length;
    total += Math.ceil(specialChars * 0.1 * multiplier);
    
    // Process files if provided
    for (const file of files) {
      try {
        if (typeof file !== 'string' || file.length === 0) {
          continue;
        }
        
        const content = await fs.promises.readFile(file, 'utf-8');
        if (content && content.length > 0) {
          const fileWords = content.trim().split(/\s+/).filter(word => word.length > 0);
          total += Math.ceil(fileWords.length * multiplier);
          
          const fileSpecialChars = (content.match(/[^\w\s]/g) || []).length;
          total += Math.ceil(fileSpecialChars * 0.1 * multiplier);
        }
      } catch (fileError) {
        console.warn(`Error reading file ${file} for token estimation:`, fileError);
        // Continue with other files
      }
    }
    
    return Math.max(1, total); // Ensure at least 1 token
  } catch (error) {
    console.warn('Error in token estimation, falling back to character count:', error);
    // Fallback: rough character-based estimation
    const cleaned = text.trim().replace(/\s+/g, ' ');
    const estimated = Math.ceil((cleaned.length / 4) * multiplier);
    return Math.max(1, estimated);
  }
}