export type AgentItemKind = 'task' | 'event' | 'note' | 'link' | 'command' | 'job' | 'reminder' | 'card' | 'bank';

export interface AgentReference {
  kind: AgentItemKind;
  id: number;
  title: string;
  url?: string;
}

export interface AgentProposal {
  id: string;
  kind: AgentItemKind;
  title: string;
  data: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'failed' | 'processing';
  created_at: number;
  expires_at: number;
}

export interface AgentHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentChatInput {
  message: string;
  history: AgentHistoryMessage[];
  timezone: string;
  utc_offset_minutes: number;
}

export interface AgentChatResponse {
  reply: string;
  model: 'openai/gpt-oss-20b';
  references: AgentReference[];
  proposals: AgentProposal[];
}

export interface AgentProposalDecision {
  proposal: AgentProposal;
  reference?: AgentReference;
}
