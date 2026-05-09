import { auth } from "./auth";
import type { ApiError, AskResponse, DocumentRead, Token, User } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const PREFIX = "/api/v1";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiError;
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d) => d.msg).join(", ");
    return `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.auth !== false) {
    const token = auth.get();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_URL}${PREFIX}${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) auth.clear();
    throw new HttpError(res.status, await parseError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  async register(email: string, password: string, full_name?: string): Promise<User> {
    return request<User>("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, full_name: full_name || null }),
      auth: false,
    });
  },

  async login(email: string, password: string): Promise<Token> {
    const body = new URLSearchParams({ username: email, password });
    return request<Token>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      auth: false,
    });
  },

  async me(): Promise<User> {
    return request<User>("/auth/me");
  },

  async listDocuments(): Promise<DocumentRead[]> {
    return request<DocumentRead[]>("/documents");
  },

  async uploadDocument(file: File): Promise<DocumentRead> {
    const formData = new FormData();
    formData.append("file", file);
    return request<DocumentRead>("/documents", { method: "POST", body: formData });
  },

  async deleteDocument(id: number): Promise<void> {
    return request<void>(`/documents/${id}`, { method: "DELETE" });
  },

  async ask(
    question: string,
    documentId: number | null = null,
    topK: number | null = null,
  ): Promise<AskResponse> {
    const body: Record<string, unknown> = { question };
    if (documentId != null) body.document_id = documentId;
    if (topK != null) body.top_k = topK;
    return request<AskResponse>("/documents/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },
};

export { HttpError, API_URL };
