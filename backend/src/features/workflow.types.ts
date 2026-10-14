export interface WorkflowSession {
  user?: { id: number; [field: string]: unknown };
  cliente?: { id: number; revision: string; viaLink?: boolean };
  cookie: { maxAge?: number; [field: string]: unknown };
  regenerate(callback: (error?: unknown) => void): void;
  save(callback: (error?: unknown) => void): void;
  destroy(callback: (error?: unknown) => void): void;
}

export interface WorkflowInput {
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  params: Record<string, string>;
  headers: Record<string, unknown>;
  locals: Record<string, unknown>;
  readonly session: WorkflowSession;
  file?: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
  get(name: string): string | undefined;
  flash(type: string, message?: string): string[] | number;
}

interface ResponseBase {
  status: number;
  headers: Record<string, string>;
}
export type WorkflowResponse = ResponseBase &
  (
    | { kind: 'continue' | 'status' }
    | { kind: 'json' | 'send'; data: unknown }
    | { kind: 'view'; view: string; data: Record<string, unknown> }
    | { kind: 'redirect' | 'download'; path: string }
  );
export type WorkflowAction = (
  input: WorkflowInput,
) => Promise<WorkflowResponse>;
export type FeatureWorkflows = Record<string, Record<string, WorkflowAction>>;
