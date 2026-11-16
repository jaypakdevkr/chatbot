import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "아직 AI 연결이 설정되지 않았어요. OPENAI_API_KEY를 환경 변수에 추가해 주세요." },
      { status: 503 },
    );
  }

  let messages: ChatMessage[];
  try {
    const body = await request.json();
    if (
      !Array.isArray(body.messages) ||
      body.messages.length === 0 ||
      body.messages.length > 40 ||
      body.messages.some(
        (message: unknown) =>
          !message ||
          typeof message !== "object" ||
          !("role" in message) ||
          !("content" in message) ||
          !["user", "assistant"].includes(String(message.role)) ||
          typeof message.content !== "string" ||
          message.content.length > 10000,
      )
    ) {
      return NextResponse.json({ error: "메시지 형식이 올바르지 않아요." }, { status: 400 });
    }
    messages = body.messages;
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400 });
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const errorBody = await upstream.json().catch(() => null);
      const message = errorBody?.error?.message ?? "AI 응답을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.";
      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
