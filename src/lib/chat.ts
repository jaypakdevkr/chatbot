export type Source = {
  sourceName: string;
  pageNumber: number | null;
};

export type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  createdAt?: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export const SOURCE_NAME = "KB 반려행복펫보험 약관";
export const SIMILARITY_THRESHOLD = 0.5;
