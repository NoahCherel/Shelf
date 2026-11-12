import { invoke } from "../core/tauri";
import type { ProviderError } from "../core/widget";

export interface HttpRequest {
  url: string;
  headers?: Record<string, string>;
  /** Filled in by Rust, so the key never reaches this page. */
  secret?: { id: string; header: string; prefix?: string };
}

export interface HttpResponse {
  status: number;
  body: string;
}

/** Network failures become an `offline` error. Status codes are left to the caller. */
export async function httpGet(req: HttpRequest): Promise<HttpResponse> {
  try {
    return await invoke<HttpResponse>("http_get", { req });
  } catch (e) {
    const offline: ProviderError = { kind: "offline", message: "Can't reach the service. Check your connection." };
    if (e === "offline") throw offline;
    throw { kind: "other", message: String(e) } satisfies ProviderError;
  }
}

export function ensureOk(res: HttpResponse, messages: Partial<Record<ProviderError["kind"], string>>): void {
  if (res.status < 400) return;
  const kind: ProviderError["kind"] =
    res.status === 401 ? "rejected" : res.status === 403 ? "forbidden" : res.status === 404 ? "notfound" : "other";
  throw { kind, message: messages[kind] ?? `The service answered with an error (${res.status}).` } satisfies ProviderError;
}
