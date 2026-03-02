// ─── Shared Types ─────────────────────────────────────────────────────────────

export type ModelRole = 'implementor' | 'supervisor';

export type SupervisionMode = 'issues-only' | 'always' | 'never';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  timestamp?: number;
}

export interface ConversationHistory {
  messages: Message[];
  tokenCount: number;
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export interface AnalysisResult {
  model: string;
  role: ModelRole;
  content: string;
  reasoning?: string;
  suggestedActions?: string[];
  tokenUsage: TokenUsage;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

// ─── Tool Use ─────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

// ─── Supervisor ───────────────────────────────────────────────────────────────

export type VerdictStatus = 'approved' | 'issues' | 'suggestions';

export interface SupervisorVerdict {
  status: VerdictStatus;
  summary: string;
  issues?: SupervisorIssue[];
  suggestions?: string[];
}

export interface SupervisorIssue {
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
  message: string;
  suggestion?: string;
}

// ─── Implementation Loop ──────────────────────────────────────────────────────

export interface ImplementationStep {
  stepNumber: number;
  action: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  verdict?: SupervisorVerdict;
  filesChanged: string[];
}

export interface ImplementationSession {
  id: string;
  prompt: string;
  steps: ImplementationStep[];
  filesChanged: Set<string>;
  startedAt: number;
  completedAt?: number;
}

// ─── File Changes ─────────────────────────────────────────────────────────────

export interface FileChange {
  path: string;
  type: 'create' | 'modify' | 'delete';
  originalContent?: string;
  newContent?: string;
  diff?: string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface ProjectContext {
  rootPath: string;
  fileTree: string;
  gitStatus?: string;
  gitBranch?: string;
  relevantFiles: RelevantFile[];
  totalTokens: number;
}

export interface RelevantFile {
  path: string;
  content: string;
  tokens: number;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export interface StreamEvent {
  type: 'text' | 'tool_call_start' | 'tool_call_end' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  error?: string;
}

export type StreamCallback = (event: StreamEvent) => void;

// ─── Config ───────────────────────────────────────────────────────────────────

export interface DuoCodeConfig {
  anthropicApiKey: string;
  openaiApiKey: string;
  claudeModel: string;
  codexModel: string;
  supervisionMode: SupervisionMode;
  maxSteps: number;
  tokenBudget: number;
  autoCommit: boolean;
  theme: 'dark' | 'light';
  forwardAnalysis: 'auto' | 'confirm';
}
