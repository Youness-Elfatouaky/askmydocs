import { AnimatePresence, motion } from "framer-motion";
import type { DocumentRead } from "../lib/types";

type Props = {
  documents: DocumentRead[];
  scopedId: number | null;
  onScope: (id: number | null) => void;
  onDelete: (id: number) => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentList({ documents, scopedId, onScope, onDelete }: Props) {
  if (documents.length === 0) {
    return (
      <div className="docs-empty">
        <span aria-hidden>📄</span>
        <p>No documents yet. Add your first PDF above.</p>
      </div>
    );
  }

  return (
    <ul className="doc-list">
      <AnimatePresence initial={false}>
        {documents.map((d) => {
          const active = d.id === scopedId;
          return (
            <motion.li
              key={d.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}
              className={`doc-card ${active ? "is-active" : ""}`}
            >
              <button
                type="button"
                className="doc-main"
                onClick={() => onScope(active ? null : d.id)}
                title={active ? "Click to ask across all docs" : "Ask only about this document"}
              >
                <div className="doc-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M7 3h7l4 4v14H7z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </div>
                <div className="doc-meta">
                  <span className="doc-name" title={d.filename}>
                    {d.filename}
                  </span>
                  <span className="doc-sub">
                    {d.page_count ?? "?"} pages · {formatSize(d.size_bytes)} ·{" "}
                    <span className={`doc-status doc-status-${d.status}`}>{d.status}</span>
                  </span>
                </div>
                {active && <span className="doc-scope-tag">scoped</span>}
              </button>
              <button
                type="button"
                className="doc-delete"
                onClick={() => onDelete(d.id)}
                aria-label={`Delete ${d.filename}`}
                title="Delete"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M5 7h14M10 7V4h4v3M6 7l1 13h10l1-13"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
