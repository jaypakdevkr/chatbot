"use client";

import { signOut } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage, Conversation, Source } from "@/lib/chat";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

const suggestions = [
  { icon: "✦", label: "고객센터 연락처", prompt: "KB손해보험 고객센터 전화와 주소가 어떻게 되나요?" },
  { icon: "⌘", label: "보험금 분담", prompt: "다른 보험과 보장 범위가 겹치면 보험금은 어떻게 분담되나요?" },
  { icon: "↗", label: "신용정보 권리", prompt: "개인신용정보 열람이나 마케팅 중단은 어떻게 요청하나요?" },
  { icon: "☼", label: "지연이자", prompt: "보험금을 늦게 받으면 지연이자는 어떻게 계산되나요?" },
];

function formatTime(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatApp({ name, avatar }: { name: string; avatar: string }) {
  const supabase = useRef(createClient()).current;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isEmpty = messages.length === 0;

  async function loadConversations() {
    const { data, error: loadError } = await supabase
      .from("conversations")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (loadError) {
      setError("대화 목록을 불러오지 못했어요.");
      return;
    }
    setConversations(
      (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    );
  }

  async function openConversation(id: string) {
    if (isLoading) return;
    setConversationId(id);
    setError("");
    const { data, error: loadError } = await supabase
      .from("messages")
      .select("id, role, content, sources, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (loadError) {
      setError("대화 내용을 불러오지 못했어요.");
      return;
    }
    setMessages(
      (data ?? []).map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        sources: (row.sources as Source[] | null) ?? [],
        createdAt: row.created_at,
      })),
    );
  }

  useEffect(() => {
    void loadConversations();
    // The browser client is stable for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || isLoading) return;

    const history = messages;
    const optimistic: ChatMessage[] = [...history, { role: "user", content, createdAt: new Date().toISOString() }, { role: "assistant", content: "" }];
    setMessages(optimistic);
    setInput("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, conversationId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "응답을 불러오지 못했어요.");
      }
      if (!response.body) throw new Error("응답 스트림을 시작하지 못했어요.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let sources: Source[] = [];
      let createdAt = new Date().toISOString();
      let nextConversationId = conversationId;

      const apply = (nextAnswer: string, nextSources = sources, nextCreatedAt = createdAt) => {
        setMessages([
          ...history,
          { role: "user", content, createdAt: new Date().toISOString() },
          { role: "assistant", content: nextAnswer, sources: nextSources, createdAt: nextCreatedAt },
        ]);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const data = event
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
          if (!data) continue;
          const parsed = JSON.parse(data);
          if (parsed.type === "meta" && typeof parsed.conversationId === "string") {
            nextConversationId = parsed.conversationId;
            setConversationId(parsed.conversationId);
          }
          if (parsed.type === "delta" && typeof parsed.text === "string") {
            answer += parsed.text;
            apply(answer);
          }
          if (parsed.type === "done") {
            sources = Array.isArray(parsed.sources) ? parsed.sources : [];
            createdAt = parsed.createdAt ?? createdAt;
            apply(answer, sources, createdAt);
          }
          if (parsed.type === "error") throw new Error(parsed.error ?? "답변을 마무리하지 못했어요.");
        }
      }

      if (nextConversationId) {
        const { data } = await supabase
          .from("messages")
          .select("id, role, content, sources, created_at")
          .eq("conversation_id", nextConversationId)
          .order("created_at", { ascending: true });
        if (data) {
          setMessages(
            data.map((row) => ({
              id: row.id,
              role: row.role,
              content: row.content,
              sources: (row.sources as Source[] | null) ?? [],
              createdAt: row.created_at,
            })),
          );
        }
      }
      await loadConversations();
    } catch (sendError) {
      setMessages(history);
      setError(sendError instanceof Error ? sendError.message : "문제가 발생했어요.");
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  function startNewChat() {
    if (isLoading) return;
    setConversationId(null);
    setMessages([]);
    setError("");
    setInput("");
    textareaRef.current?.focus();
  }

  return (
    <main className="app-shell with-sidebar">
      <aside className="sidebar" aria-label="대화 목록">
        <div className="sidebar-head">
          <Link className="brand" href="/chat" aria-label="Morrow 홈">
            <span className="brand-mark" aria-hidden="true">m</span>
            <span>morrow</span>
          </Link>
          <button className="new-chat-button" onClick={startNewChat} type="button">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
            <span>새 대화</span>
          </button>
        </div>
        <div className="room-list">
          {conversations.length === 0 ? <p className="room-empty">아직 저장된 대화가 없어요.</p> : null}
          {conversations.map((conversation) => (
            <button
              className={`room-item${conversation.id === conversationId ? " is-active" : ""}`}
              key={conversation.id}
              onClick={() => void openConversation(conversation.id)}
              type="button"
            >
              <span>{conversation.title}</span>
              <time dateTime={conversation.createdAt}>{formatTime(conversation.createdAt)}</time>
            </button>
          ))}
        </div>
      </aside>

      <section className="chat-column">
        <header className="topbar">
          <span className="model-label"><span className="status-dot" /> 약관 도우미</span>
          <div className="profile">
            {avatar ? <Image src={avatar} alt="" width={28} height={28} /> : <span className="profile-fallback">{name.slice(0, 1)}</span>}
            <span className="profile-name">{name}</span>
            <form action={signOut}>
              <button className="logout-button" type="submit">로그아웃</button>
            </form>
          </div>
        </header>

        <section className={`chat-area${isEmpty ? " is-empty" : ""}`} aria-label="채팅">
          {isEmpty ? (
            <div className="welcome">
              <div className="welcome-sparkle" aria-hidden="true">✳</div>
              <p className="eyebrow">PET INSURANCE GUIDE</p>
              <h1>{name}님, <span>약관에서 찾아드릴까요?</span></h1>
              <p className="welcome-copy">KB 반려행복펫보험 약관과 관련된 질문은 문서를 찾아 답하고,<br className="mobile-break" /> 참고한 문서도 함께 보여드려요.</p>
              <div className="suggestions" aria-label="추천 대화">
                {suggestions.map((suggestion) => (
                  <button className="suggestion-card" key={suggestion.label} onClick={() => void sendMessage(suggestion.prompt)} type="button">
                    <span className="suggestion-icon" aria-hidden="true">{suggestion.icon}</span>
                    <span>{suggestion.label}</span>
                    <svg className="suggestion-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 15 15 5M6 5h9v9" /></svg>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="conversation" aria-live="polite">
              {messages.map((message, index) => (
                <article className={`message message-${message.role}`} key={message.id ?? `${index}-${message.role}`}>
                  {message.role === "assistant" ? <span className="assistant-avatar" aria-hidden="true">m</span> : null}
                  <div className="message-content">
                    {message.content ? <p>{message.content}</p> : isLoading && index === messages.length - 1 ? <span className="typing-indicator"><i /><i /><i /></span> : null}
                    {message.role === "assistant" && message.sources && message.sources.length > 0 ? (
                      <ul className="sources">
                        {message.sources.map((source) => (
                          <li key={`${source.sourceName}-${source.pageNumber}`}>
                            참고: {source.sourceName}{source.pageNumber ? ` · ${source.pageNumber}쪽` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {message.createdAt && message.content ? <time className="message-time" dateTime={message.createdAt}>{formatTime(message.createdAt)}</time> : null}
                  </div>
                </article>
              ))}
              {error ? <p className="error-message" role="alert">{error}</p> : null}
              <div ref={bottomRef} />
            </div>
          )}

          <div className="composer-wrap">
            {error && isEmpty ? <p className="error-message composer-error" role="alert">{error}</p> : null}
            <form className="composer" onSubmit={handleSubmit}>
              <textarea
                ref={textareaRef}
                aria-label="메시지 입력"
                autoComplete="off"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="약관에 대해 물어보세요..."
                rows={1}
                value={input}
              />
              <div className="composer-footer">
                <span className="composer-hint"><kbd>↵</kbd> 전송 <span className="hint-divider">·</span> <kbd>shift + ↵</kbd> 줄바꿈</span>
                <button className="send-button" disabled={!input.trim() || isLoading} type="submit" aria-label="메시지 보내기">
                  {isLoading ? <span className="send-spinner" /> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5m0 0L5.5 9.5M10 5l4.5 4.5" /></svg>}
                </button>
              </div>
            </form>
            <p className="disclaimer">Morrow는 약관을 찾아 설명하지만, 실제 보상 여부는 증권과 약관을 다시 확인해 주세요.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
