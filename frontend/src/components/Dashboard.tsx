import { useEffect, useState } from "react";
import { api, HttpError } from "../lib/api";
import type { DocumentRead, User } from "../lib/types";
import { Chat } from "./Chat";
import { Sidebar } from "./Sidebar";

type Props = {
  user: User;
  onLogout: () => void;
};

export function Dashboard({ user, onLogout }: Props) {
  const [documents, setDocuments] = useState<DocumentRead[]>([]);
  const [scopedId, setScopedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const docs = await api.listDocuments();
      setDocuments(docs);
    } catch (e) {
      setError(e instanceof HttpError ? e.message : "Failed to load documents");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: number) {
    setDocuments((d) => d.filter((x) => x.id !== id));
    if (scopedId === id) setScopedId(null);
    try {
      await api.deleteDocument(id);
    } catch {
      load();
    }
  }

  function handleUploaded(doc: DocumentRead) {
    setDocuments((d) => [doc, ...d]);
  }

  const scopedDoc = scopedId == null ? null : documents.find((d) => d.id === scopedId) ?? null;

  return (
    <div className="workspace">
      <Sidebar
        user={user}
        documents={documents}
        scopedId={scopedId}
        onScope={setScopedId}
        onUploaded={handleUploaded}
        onDelete={handleDelete}
        onLogout={onLogout}
      />
      <Chat user={user} scopedDoc={scopedDoc} onClearScope={() => setScopedId(null)} />
      {error && <div className="global-error">{error}</div>}
    </div>
  );
}
