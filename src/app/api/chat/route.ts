import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { retrieveContext } from "@/lib/rag";
import { SOURCE_NAME, type Source } from "@/lib/chat";

export const runtime = "nodejs";

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY가 설정되지 않았어요." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) {
    return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  let content = "";
  let conversationId: string | null = null;
  try {
    const body = await request.json();
    content = typeof body.content === "string" ? body.content.trim() : "";
    if (typeof body.conversationId === "string" && body.conversationId) {
      conversationId = body.conversationId;
    }
  } catch {
    return Response.json({ error: "요청을 읽지 못했어요." }, { status: 400 });
  }

  if (!content || content.length > 4000) {
    return Response.json({ error: "질문은 1자 이상 4,000자 이하여야 해요." }, { status: 400 });
  }
  if (conversationId && !UUID.test(conversationId)) {
    return Response.json({ error: "대화방 정보가 올바르지 않아요." }, { status: 400 });
  }

  if (!conversationId) {
    const title = content.replace(/\s+/g, " ").slice(0, 42);
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: userId, title })
      .select("id")
      .single();
    if (error || !data) {
      return Response.json({ error: "대화방을 만들지 못했어요." }, { status: 500 });
    }
    conversationId = data.id;
  } else {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return Response.json({ error: "대화방을 찾을 수 없어요." }, { status: 404 });
  }

  const { data: previous } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(10);

  const history = ((previous ?? []) as HistoryMessage[]).reverse();
  const previousQuestion = [...history].reverse().find((message) => message.role === "user")?.content;
  const retrievalQuery = [previousQuestion, content].filter(Boolean).join("\n");

  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "user",
    content,
  });
  if (insertError) {
    return Response.json({ error: "질문을 저장하지 못했어요." }, { status: 500 });
  }

  let sources: Source[] = [];
  let context = "";
  try {
    const retrieved = await retrieveContext(supabase, retrievalQuery);
    sources = retrieved.sources;
    context = retrieved.context;
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 검색에 실패했어요.";
    return Response.json({ error: message }, { status: 502 });
  }

  const system = [
    "너는 Morrow야. KB 반려행복펫보험 약관을 읽어 주는 한국어 도우미야.",
    "답변은 짧고 분명하게, 존댓말로 해.",
    context
      ? `아래 참고 문서와 관련된 질문이야. 참고 문서에 있는 내용만 근거로 답하고, 문서에 없으면 그렇다고 말해. 금액을 지어내지 마.\n\n참고 문서:\n${context}`
      : "이 질문은 첨부된 약관 데이터와 충분히 관련 있지 않아. 참고 문서를 인용하지 말고, 일반적인 도움만 짧게 줘. 약관에 있는 것처럼 꾸며내지 마.",
  ].join("\n\n");

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        stream: true,
        messages: [
          { role: "system", content: system },
          ...history,
          { role: "user", content },
        ],
      }),
    });
  } catch {
    return Response.json({ error: "AI 서버에 연결하지 못했어요." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const errorBody = await upstream.json().catch(() => null);
    return Response.json(
      { error: errorBody?.error?.message ?? "AI 응답을 가져오지 못했어요." },
      { status: upstream.status || 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  const savedConversationId = conversationId;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({ type: "meta", conversationId: savedConversationId });
      let answer = "";
      let buffer = "";

      try {
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
            if (!data || data === "[DONE]") continue;
            const parsed = JSON.parse(data);
            const text = parsed.choices?.[0]?.delta?.content;
            if (typeof text === "string" && text) {
              answer += text;
              send({ type: "delta", text });
            }
          }
        }

        const createdAt = new Date().toISOString();
        if (answer.trim()) {
          await supabase.from("messages").insert({
            conversation_id: savedConversationId,
            user_id: userId,
            role: "assistant",
            content: answer,
            sources: sources.length ? sources : null,
            created_at: createdAt,
          });
        }
        send({
          type: "done",
          createdAt,
          sources,
          sourceLabel: sources.length ? SOURCE_NAME : null,
        });
        controller.close();
      } catch {
        send({ type: "error", error: "답변을 마무리하지 못했어요." });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
