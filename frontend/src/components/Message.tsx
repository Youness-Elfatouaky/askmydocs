import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { Citation } from "../lib/types";
import { Avatar } from "./Avatar";

export type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; citations: Citation[]; pending?: boolean };

type Props = {
  message: ChatMessage;
  userName: string;
};

export function Message({ message, userName }: Props) {
  const [showCitations, setShowCitations] = useState(false);
  const isUser = message.role === "user";
  return (
    <motion.div
      className={`msg ${isUser ? "msg-user" : "msg-ai"}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Avatar kind={isUser ? "user" : "ai"} name={userName} size={34} />
      <div className="msg-body">
        <div className="msg-meta">
          <span className="msg-author">{isUser ? userName : "AskMyDocs AI"}</span>
        </div>
        <div className="msg-bubble">
          {message.role === "assistant" && message.pending ? (
            <div className="typing">
              <span /> <span /> <span />
            </div>
          ) : (
            <div className="msg-text">{message.content}</div>
          )}
        </div>
        {message.role === "assistant" && message.citations.length > 0 && (
          <div className="citations">
            <button
              type="button"
              className="citations-toggle"
              onClick={() => setShowCitations((v) => !v)}
            >
              {showCitations ? "Hide" : "Show"} {message.citations.length} citation
              {message.citations.length === 1 ? "" : "s"}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                style={{
                  transform: showCitations ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 0.2s",
                }}
                aria-hidden
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <AnimatePresence initial={false}>
              {showCitations && (
                <motion.ul
                  className="citation-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  {message.citations.map((c, i) => (
                    <li key={`${c.document_id}-${c.chunk_index}-${i}`} className="citation">
                      <div className="citation-head">
                        <span className="citation-rank">[{i + 1}]</span>
                        <span className="citation-file" title={c.filename}>
                          {c.filename}
                        </span>
                        {c.page_number != null && (
                          <span className="citation-page">p.{c.page_number}</span>
                        )}
                        <span className="citation-score" title="Similarity score">
                          {(c.score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="citation-snippet">{c.snippet}…</div>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}
