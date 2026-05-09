import { motion } from "framer-motion";
import { useRef, useState, type DragEvent } from "react";
import { api, HttpError } from "../lib/api";
import type { DocumentRead } from "../lib/types";

type Props = {
  onUploaded: (doc: DocumentRead) => void;
};

export function UploadButton({ onUploaded }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDFs are supported");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const doc = await api.uploadDocument(file);
      onUploaded(doc);
    } catch (e) {
      setError(e instanceof HttpError ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="upload-wrap">
      <motion.div
        className={`dropzone ${dragOver ? "is-over" : ""} ${busy ? "is-busy" : ""}`}
        onClick={() => !busy && fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        whileHover={!busy ? { scale: 1.01 } : {}}
        whileTap={!busy ? { scale: 0.99 } : {}}
        role="button"
        tabIndex={0}
      >
        {busy ? (
          <div className="dz-busy">
            <div className="spinner" />
            <span>Indexing your PDF…</span>
          </div>
        ) : (
          <>
            <div className="dz-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="dz-text">
              <strong>Add a PDF</strong>
              <span>Click or drag &amp; drop</span>
            </div>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </motion.div>
      {error && <div className="dz-error">{error}</div>}
    </div>
  );
}
