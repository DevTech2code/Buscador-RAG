export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ShownProductReference {
  code: string;
  name: string;
  stockQuantity: number;
  brandName: string;
}

export interface ChatConversationContext {
  lastSearchTerm: string | null;
  selectedProductCode: string | null;
  lastShownProducts: ShownProductReference[];
}

export interface ChatSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  context: ChatConversationContext;
}
