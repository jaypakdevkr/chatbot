import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";

const SOURCE_NAME = "KB 반려행복펫보험 약관";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const upstageKey = process.env.UPSTAGE_API_KEY;

if (!url || !key || !upstageKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, UPSTAGE_API_KEY가 필요해요.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function chunkPage(text, size = 800, overlap = 120) {
  const clean = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length < 40) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      const breakAt = clean.lastIndexOf("\n", end);
      if (breakAt > start + 240) end = breakAt;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

async function embedPassages(texts) {
  const vectors = [];
  for (let index = 0; index < texts.length; index += 16) {
    const batch = texts.slice(index, index + 16);
    const response = await fetch("https://api.upstage.ai/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstageKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "solar-embedding-2-passage", input: batch }),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body?.error?.message ?? `Upstage embeddings failed (${response.status})`);
    }
    const ordered = body.data.slice().sort((a, b) => a.index - b.index);
    vectors.push(...ordered.map((row) => row.embedding));
  }
  return vectors;
}

const pdf = await getDocumentProxy(new Uint8Array(await readFile("dataset/kb.pdf")));
const { text, totalPages } = await extractText(pdf, { mergePages: false });
const pages = Array.isArray(text) ? text : [text];
const chunks = [];

pages.forEach((pageText, pageIndex) => {
  chunkPage(String(pageText)).forEach((content) => {
    chunks.push({
      source_name: SOURCE_NAME,
      page_number: pageIndex + 1,
      chunk_index: chunks.length,
      content,
    });
  });
});

if (chunks.length === 0) {
  console.error("PDF에서 텍스트를 찾지 못했어요.");
  process.exit(1);
}

console.log(`pages ${totalPages}, chunks ${chunks.length}`);
const embeddings = await embedPassages(chunks.map((chunk) => chunk.content));
const rows = chunks.map((chunk, index) => ({
  ...chunk,
  embedding: embeddings[index],
}));

const { error: deleteError } = await supabase.from("document_chunks").delete().eq("source_name", SOURCE_NAME);
if (deleteError) throw deleteError;

const { error: insertError } = await supabase.from("document_chunks").insert(rows);
if (insertError) throw insertError;

console.log(`stored ${rows.length} chunks in Supabase`);
