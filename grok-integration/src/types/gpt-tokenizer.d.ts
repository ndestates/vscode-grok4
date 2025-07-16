declare module 'gpt-tokenizer' {
  export function encode(text: string): number[];
  export const decoder: TextDecoder;  // Explicitly declare as value
}