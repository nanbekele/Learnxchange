import { pipeline } from "@xenova/transformers";

let extractorPromise: Promise<any> | null = null;

const getExtractor = async () => {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return extractorPromise;
};

const meanPool = (tokenEmbeddings: number[][]) => {
  const dim = tokenEmbeddings[0]?.length ?? 0;
  const out = new Array(dim).fill(0);
  const n = tokenEmbeddings.length || 1;
  for (const t of tokenEmbeddings) {
    for (let i = 0; i < dim; i++) out[i] += t[i] ?? 0;
  }
  for (let i = 0; i < dim; i++) out[i] /= n;
  return out;
};

const normalize = (v: number[]) => {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq) || 1;
  return v.map((x) => x / norm);
};

export const buildCourseEmbeddingText = (input: {
  title?: string | null;
  description?: string | null;
  tags?: string[] | string | null;
}) => {
  const title = String(input.title ?? "").trim();
  const description = String(input.description ?? "").trim();
  const tagsArr = Array.isArray(input.tags)
    ? input.tags
    : typeof input.tags === "string"
      ? input.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

  const tags = tagsArr.length ? `Tags: ${tagsArr.join(", ")}.` : "";
  return [title ? `Title: ${title}.` : "", description ? `Description: ${description}.` : "", tags]
    .filter(Boolean)
    .join("\n");
};

export const generateEmbedding384 = async (text: string) => {
  const extractor = await getExtractor();

  const output = await extractor(text, { pooling: "none", normalize: false });
  const data = output?.data as number[][][] | number[][] | undefined;

  let tokenEmbeddings: number[][] | null = null;
  if (Array.isArray(data) && Array.isArray(data[0]) && Array.isArray((data as any)[0][0])) {
    tokenEmbeddings = (data as number[][][])[0];
  } else if (Array.isArray(data) && Array.isArray(data[0])) {
    tokenEmbeddings = data as number[][];
  }

  if (!tokenEmbeddings || tokenEmbeddings.length === 0) {
    throw new Error("Embedding model returned empty output");
  }

  const pooled = meanPool(tokenEmbeddings);
  const vec = normalize(pooled);

  if (vec.length !== 384) {
    throw new Error(`Unexpected embedding length: ${vec.length} (expected 384)`);
  }

  return vec;
};

export const avgEmbeddings = (vectors: number[][]) => {
  if (!vectors.length) return null;
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] += v[i] ?? 0;
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return normalize(out);
};

export const toPgVector = (vec: number[]) => {
  return `[${vec.map((n) => (Number.isFinite(n) ? n.toFixed(8) : "0")).join(",")}]`;
};
