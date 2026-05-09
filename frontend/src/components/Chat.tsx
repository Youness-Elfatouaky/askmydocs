import { motion } from "framer-motion";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, HttpError } from "../lib/api";
import type { DocumentRead, User } from "../lib/types";
import { Message, type ChatMessage } from "./Message";

type Props = {
  user: User;
  scopedDoc: DocumentRead | null;
  onClearScope: () => void;
};

let msgId = 0;
const nextId = () => `m${++msgId}`;

export function Chat({ user, scopedDoc, onClearScope }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const userName = user.full_name || user.email.split("@")[0];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  function autosize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }

  async function send() {
    const q = input.trim();
    if (!q || sending) return;
    const userMsg: ChatMessage = { id: nextId(), role: "user", content: q };
    const pendingId = nextId();
    setMessages((m) => [
      ...m,
      userMsg,
      { id: pendingId, role: "assistant", content: "", citations: [], pending: true },
    ]);
    setInput("");
    autosize();
    setSending(true);
    setError(null);
    try {
      const res = await api.ask(q, scopedDoc?.id ?? null);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === pendingId
            ? { id: pendingId, role: "assistant", content: res.answer, citations: res.citations }
            : msg,
        ),
      );
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : "Network error";
      setMessages((m) =>
        m.map((x) =>
          x.id === pendingId
            ? { id: pendingId, role: "assistant", content: `⚠️ ${msg}`, citations: [] }
            : x,
        ),
      );
      setError(msg);
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <motion.section
      className="chat"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <header className="chat-header">
        <div>
          <div className="chat-title">Ask your documents</div>
          <div className="chat-sub">
            {scopedDoc ? (
              <>
                Asking about{" "}
                <button className="scope-chip" onClick={onClearScope} title="Click to clear scope">
                  📄 {scopedDoc.filename} ✕
                </button>
              </>
            ) : (
              "Searching across all your documents"
            )}
          </div>
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-orb" />
            <h2>Hi {userName} 👋</h2>
            <p>
              Upload a PDF on the left, then ask anything. I'll answer using your documents and
              show you exactly where the answer came from.
            </p>
            <div className="suggestions">
              {[
                "What is this document about?",
                "Summarize the main points",
                "List all the key dates",
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  className="suggestion"
                  onClick={() => {
                    setInput(s);
                    setTimeout(autosize, 0);
                    taRef.current?.focus();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} userName={userName} />
        ))}
      </div>

      <div className="chat-input-wrap">
        <textarea
          ref={taRef}
          className="chat-input"
          placeholder={scopedDoc ? `Ask about ${scopedDoc.filename}…` : "Ask anything…"}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autosize();
          }}
          onKeyDown={onKey}
          rows={1}
          disabled={sending}
        />
        <button
          type="button"
          className="send-btn"
          onClick={send}
          disabled={!input.trim() || sending}
          aria-label="Send"
        >
          {sending ? (
            <span className="spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 12h16M14 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
      {error && <div className="chat-error">{error}</div>}
    </motion.section>
  );
}
