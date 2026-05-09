export type User = {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
};

export type Token = {
  access_token: string;
  token_type: string;
};

export type ApiError = {
  detail: string | { msg: string }[];
};

export type DocumentRead = {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  status: string;
  page_count: number | null;
  created_at: string;
};

export type Citation = {
  document_id: number;
  filename: string;
  chunk_index: number;
  page_number: number | null;
  snippet: string;
  score: number;
};

export type AskResponse = {
  answer: string;
  citations: Citation[];
};
