"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import Link from "next/link";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const suggestions = [
  { icon: "✦", label: "아이디어 정리하기", prompt: "새로운 프로젝트 아이디어를 함께 정리해 줘." },
  { icon: "⌘", label: "글쓰기 도움받기", prompt: "친구에게 보낼 따뜻한 생일 축하 메시지를 써 줘." },
  { icon: "↗", label: "새로운 것 배우기", prompt: "인공지능을 처음 배우는 사람도 이해할 수 있게 설명해 줘." },
  { icon: "☼", label: "하루 계획 세우기", prompt: "집중해서 일할 수 있는 하루 일정을 짜 줘." },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isEmpty = messages.length === 0;

  async function sendMessage(text: string, history: Message[] = messages) {
    const content = text.trim();
    if (!content || isLoading) return;

    const nextMessages: Message[] = [...history, { role: "user", content }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "응답을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      if (!response.body) throw new Error("응답 스트림을 시작하지 못했어요.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      const appendChunk = (chunk: string) => {
        buffer += chunk;
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const data = event
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const text = parsed.choices?.[0]?.delta?.content;
            if (typeof text === "string") answer += text;
          } catch {
            // Ignore incomplete or non-JSON SSE events.
          }
        }

        setMessages([...nextMessages, { role: "assistant", content: answer }]);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        appendChunk(decoder.decode(value, { stream: true }));
      }
      appendChunk(decoder.decode());
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    } catch (sendError) {
      setMessages(nextMessages);
      setError(sendError instanceof Error ? sendError.message : "문제가 발생했어요. 다시 시도해 주세요.");
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
    setMessages([]);
    setError("");
    setInput("");
    textareaRef.current?.focus();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Morrow 홈">
          <span className="brand-mark" aria-hidden="true">m</span>
          <span>morrow</span>
        </Link>
        <div className="topbar-right">
          <span className="model-label"><span className="status-dot" /> AI 어시스턴트</span>
          <button className="new-chat-button" onClick={startNewChat} type="button">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
            <span>새 대화</span>
          </button>
        </div>
      </header>

      <section className={`chat-area${isEmpty ? " is-empty" : ""}`} aria-label="채팅">
        {isEmpty ? (
          <div className="welcome">
            <div className="welcome-sparkle" aria-hidden="true">✳</div>
            <p className="eyebrow">YOUR THOUGHTFUL AI COMPANION</p>
            <h1>안녕하세요, <span>무엇을 도와드릴까요?</span></h1>
            <p className="welcome-copy">아이디어부터 일상의 궁금증까지,<br className="mobile-break" /> 편하게 이야기를 시작해 보세요.</p>
            <div className="suggestions" aria-label="추천 대화">
              {suggestions.map((suggestion) => (
                <button
                  className="suggestion-card"
                  key={suggestion.label}
                  onClick={() => void sendMessage(suggestion.prompt)}
                  type="button"
                >
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
              <article className={`message message-${message.role}`} key={`${index}-${message.role}`}>
                {message.role === "assistant" && <span className="assistant-avatar" aria-hidden="true">m</span>}
                <div className="message-content">
                  {message.content ? <p>{message.content}</p> : isLoading && index === messages.length - 1 ? <span className="typing-indicator"><i /><i /><i /></span> : null}
                </div>
              </article>
            ))}
            {error && <p className="error-message" role="alert">{error}</p>}
            <div ref={bottomRef} />
          </div>
        )}

        <div className="composer-wrap">
          {!isEmpty && error && <button className="retry-button" onClick={() => void sendMessage(messages[messages.length - 1]?.content ?? "", messages.slice(0, -1))} type="button">다시 시도</button>}
          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              aria-label="메시지 입력"
              autoComplete="off"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="무엇이든 물어보세요..."
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
          <p className="disclaimer">Morrow는 AI라서 실수할 수 있어요. 중요한 내용은 꼭 다시 확인해 주세요.</p>
        </div>
      </section>
    </main>
  );
}
