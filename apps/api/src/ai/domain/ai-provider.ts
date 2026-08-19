export type AiMessageRole = 'user' | 'assistant';

export interface AiMessage {
  role: AiMessageRole;
  content: string;
}

export interface AiGenerationRequest {
  systemInstruction: string;
  messages: readonly AiMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: 'application/json' | 'text/plain';
}

export interface AiGenerationResult {
  text: string;
  provider: 'gemini' | 'openai';
  model: string;
}

export interface AiProvider {
  readonly name: 'gemini' | 'openai';
  generate(request: AiGenerationRequest): Promise<AiGenerationResult>;
}

export const GEMINI_PROVIDER = Symbol('GEMINI_PROVIDER');
export const OPENAI_PROVIDER = Symbol('OPENAI_PROVIDER');
