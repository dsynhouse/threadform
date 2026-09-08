// The minimal platform binding surface used by this app. Runtime bindings are provisioned by Sites.
interface D1Result<T = Record<string, unknown>> { results: T[]; success: boolean; meta: { changes: number } }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}
interface D1Database { prepare(query: string): D1PreparedStatement; batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>; exec(query: string): Promise<unknown> }
interface Fetcher { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }
interface StoredBlob { body: ReadableStream; text(): Promise<string>; httpMetadata?: { contentType?: string } }
interface StudioBucket { put(key: string, value: string | ArrayBuffer | ReadableStream, options?: {httpMetadata?: {contentType: string}}): Promise<unknown>; get(key: string): Promise<StoredBlob | null>; delete(key: string): Promise<void> }
declare module "cloudflare:workers" {
  export const env: { DB?: D1Database; ASSETS?: Fetcher; STORAGE?: StudioBucket; PINTEREST_APP_ID?: string; PINTEREST_APP_SECRET?: string; PINTEREST_REDIRECT_URI?: string; INTEGRATION_ENCRYPTION_KEY?: string; [key: string]: unknown };
}
