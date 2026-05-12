"use client";
import { useState, useRef, useEffect } from "react";
import { A } from "./ui/palette";

const STARTER_QUESTIONS = [
  "Why did you open with that hook?",
  "What research did you actually find?",
  "Why this company angle?",
  "What's uncertain in this email?",
];

function Message({ role, content }) {
  const isUser = role === "user";
  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 10,
    }}>
      <div style={{
        maxWidth: "82%",
        padding: "9px 13px",
        borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
        background: isUser ? A.nebula : A.offWhite,
        color: isUser ? A.white : A.text,
        fontSize: 13,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {content}
      </div>
    </div>
  );
}

export default function DraftChatPanel({ lead }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Reset conversation when lead changes
  useEffect(() => {
    setMessages([]);
    setInput("");
    setError(null);
  }, [lead?.id]);

  async function send(text) {
    const userText = text ?? input.trim();
    if (!userText || loading) return;
    setInput("");
    setError(null);

    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch(`/api/leads/${lead.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Request failed");
      setMessages(m => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e.message);
      setMessages(m => m.slice(0, -1)); // remove the user message on failure
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const hasDraft = !!lead?.emailDraft;

  return (
    <div style={{
      background: A.white,
      border: `1px solid ${A.satellite}`,
      borderRadius: 8,
      overflow: "hidden",
    }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "11px 16px", background: "none", border: "none", cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: A.text, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 15 }}>💬</span>
          Ask about this draft
        </span>
        <span style={{ fontSize: 11, color: A.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
          {messages.length > 0 && (
            <span style={{
              background: A.horizonFaint, color: A.horizonDark,
              borderRadius: 10, padding: "1px 7px", fontWeight: 600, fontSize: 11,
            }}>
              {messages.filter(m => m.role === "user").length} question{messages.filter(m => m.role === "user").length !== 1 ? "s" : ""}
            </span>
          )}
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Chat body */}
      {open && (
        <div style={{ borderTop: `1px solid ${A.satellite}` }}>
          {/* Message area */}
          <div style={{
            padding: "14px 16px",
            minHeight: messages.length === 0 ? 0 : 80,
            maxHeight: 360,
            overflowY: "auto",
          }}>
            {messages.length === 0 && (
              <div style={{ color: A.textMuted, fontSize: 13, marginBottom: 14 }}>
                {hasDraft
                  ? "Ask anything about why the email was written this way — the hook, the research, specific claims, what was uncertain."
                  : "Generate a draft first, then ask questions about the reasoning here."}
              </div>
            )}
            {messages.map((m, i) => (
              <Message key={i} role={m.role} content={m.content} />
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
                <div style={{
                  padding: "9px 13px", borderRadius: "12px 12px 12px 2px",
                  background: A.offWhite, fontSize: 13, color: A.textMuted,
                }}>
                  Thinking…
                </div>
              </div>
            )}
            {error && (
              <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Starter chips — only shown before any messages */}
          {messages.length === 0 && hasDraft && (
            <div style={{ padding: "0 16px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STARTER_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={loading}
                  style={{
                    fontSize: 12, padding: "4px 10px", borderRadius: 16,
                    border: `1px solid ${A.satellite}`, background: A.offWhite,
                    color: A.text, cursor: "pointer", fontFamily: "inherit",
                    transition: "border-color 0.1s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = A.horizon}
                  onMouseLeave={e => e.currentTarget.style.borderColor = A.satellite}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            display: "flex", gap: 8, padding: "10px 16px",
            borderTop: `1px solid ${A.satellite}`, background: A.offWhite,
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={hasDraft ? "Ask a question… (Enter to send)" : "Generate a draft first"}
              disabled={loading || !hasDraft}
              rows={1}
              style={{
                flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${A.satellite}`, outline: "none", color: A.text,
                fontFamily: "inherit", resize: "none", background: A.white,
                lineHeight: 1.4, minHeight: 36,
              }}
              onFocus={e => e.target.style.borderColor = A.horizon}
              onBlur={e => e.target.style.borderColor = A.satellite}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading || !hasDraft}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: (!input.trim() || loading || !hasDraft) ? A.satellite : A.nebula,
                color: A.white, border: "none", cursor: (!input.trim() || loading || !hasDraft) ? "default" : "pointer",
                fontFamily: "inherit", transition: "background 0.1s", flexShrink: 0,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
