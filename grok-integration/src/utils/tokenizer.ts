import { Tiktoken } from '@dqbd/tiktoken';
import { encoding_for_model } from '@dqbd/tiktoken';

// Note: Ensure '@dqbd/tiktoken' is installed via npm or yarn.
// This library provides accurate tokenization for GPT models.

export function tokenizeText(text: string, model: string = 'gpt-3.5-turbo'): number {
  try {
    const encoding = encoding_for_model(model);
    const tokenizer: Tiktoken = new Tiktoken(encoding);
    const tokens = tokenizer.encode(text);
    return tokens.length;
  } catch (error) {
    console.error('Tokenization error:', error);
    // Fallback to a simple heuristic if tokenization fails
    return text.split(/\s+/).length + 1; // Approximate token count
  }
}

// Usage example:
// const tokenCount = tokenizeText('Hello, world!');