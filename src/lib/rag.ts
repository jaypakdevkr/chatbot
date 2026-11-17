import type { SupabaseClient } from "@supabase/supabase-js";
import { SIMILARITY_THRESHOLD, SOURCE_NAME, type Source } from "@/lib/chat";

const UPSTAGE_URL = "https://api.upstage.ai/v1/embeddings";

type MatchRow = {
  id: string;
  source_name: string;
  page_number: number | null;
  content: string;
  similarity: number;
};

async function embed(input: string | string[], model: "solar-embedding-2-query" | "solar-embedding-2-passage") {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) throw new Error("UPSTAGE_API_KEY가 설정되지 않았어요.");

  const response = await fetch(UPSTAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message ?? "문서 임베딩에 실패했어요.";
    throw new Error(message);
  }

  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows
    .slice()
    .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((row: { embedding: number[] }) => row.embedding);
}

export async function embedQuery(text: string) {
  const [vector] = await embed(text, "solar-embedding-2-query");
  if (!vector?.length) throw new Error("질문 임베딩을 만들지 못했어요.");
  return vector;
}

export async function embedPassages(texts: string[]) {
  if (texts.length === 0) return [];
  const vectors: number[][] = [];
  for (let index = 0; index < texts.length; index += 20) {
    const batch = texts.slice(index, index + 20);
    vectors.push(...(await embed(batch, "solar-embedding-2-passage")));
  }
  return vectors;
}

export async function retrieveContext(supabase: SupabaseClient, question: string) {
  const embedding = await embedQuery(question);
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: embedding,
    match_count: 4,
  });

  if (error) {
    throw new Error("참고 문서를 검색하지 못했어요. 데이터베이스 설정이 끝났는지 확인해 주세요.");
  }

  const matches = ((data ?? []) as MatchRow[]).filter((row) => Number(row.similarity) >= SIMILARITY_THRESHOLD);
  if (matches.length === 0) {
    return { context: "", sources: [] as Source[], related: false };
  }

  const sources = uniqueSources(matches);
  const context = matches
    .map((row, index) => {
      const page = row.page_number ? ` ${row.page_number}쪽` : "";
      return `[${index + 1}] ${row.source_name || SOURCE_NAME}${page}\n${row.content}`;
    })
    .join("\n\n");

  return { context, sources, related: true };
}

function uniqueSources(matches: MatchRow[]): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const row of matches) {
    const source: Source = {
      sourceName: row.source_name || SOURCE_NAME,
      pageNumber: row.page_number,
    };
    const key = `${source.sourceName}:${source.pageNumber ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(source);
  }
  return sources;
}
