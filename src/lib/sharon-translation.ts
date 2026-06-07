import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ContentKind = "announcement" | "document";
type TranslationFields = Record<string, string>;
type Translator = (kind: ContentKind, fields: TranslationFields) => Promise<TranslationFields>;

type AnnouncementBody = {
  title_th?: string | null;
  title_en?: string | null;
  content_th?: string | null;
  content_en?: string | null;
  [key: string]: unknown;
};

type DocumentBody = {
  title_th?: string | null;
  title_en?: string | null;
  description_th?: string | null;
  description_en?: string | null;
  [key: string]: unknown;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function collectMissingEnglishPairs(pairs: Array<{ sourceKey: string; targetKey: string; outputKey: string; body: Record<string, unknown> }>) {
  const fields: TranslationFields = {};
  const outputToTarget = new Map<string, string>();

  for (const pair of pairs) {
    const source = clean(pair.body[pair.sourceKey]);
    const target = clean(pair.body[pair.targetKey]);
    if (source && !target) {
      fields[pair.outputKey] = source;
      outputToTarget.set(pair.outputKey, pair.targetKey);
    }
  }

  return { fields, outputToTarget };
}

async function applyTranslations<T extends Record<string, unknown>>(
  body: T,
  kind: ContentKind,
  pairs: Array<{ sourceKey: string; targetKey: string; outputKey: string; body: Record<string, unknown> }>,
  translator: Translator = translateThaiFieldsToEnglish,
): Promise<T> {
  const { fields, outputToTarget } = collectMissingEnglishPairs(pairs);
  if (Object.keys(fields).length === 0) return body;

  const translations = await translator(kind, fields);
  const next = { ...body };
  for (const [outputKey, targetKey] of outputToTarget.entries()) {
    const translated = clean(translations[outputKey]);
    if (translated) next[targetKey as keyof T] = translated as T[keyof T];
  }
  return next;
}

export async function autoTranslateAnnouncementEnglish(
  body: AnnouncementBody,
  translator: Translator = translateThaiFieldsToEnglish,
) {
  return applyTranslations(body, "announcement", [
    { body, sourceKey: "title_th", targetKey: "title_en", outputKey: "title" },
    { body, sourceKey: "content_th", targetKey: "content_en", outputKey: "content" },
  ], translator);
}

export async function autoTranslateDocumentEnglish(
  body: DocumentBody,
  translator: Translator = translateThaiFieldsToEnglish,
) {
  return applyTranslations(body, "document", [
    { body, sourceKey: "title_th", targetKey: "title_en", outputKey: "title" },
    { body, sourceKey: "description_th", targetKey: "description_en", outputKey: "description" },
  ], translator);
}

async function translateViaHttpBridge(kind: ContentKind, fields: TranslationFields, url: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, fields }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sharon translation bridge failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text);
  return data.translations || data;
}

function extractJsonObject(text: string) {
  const cleaned = text
    .split("\n")
    .filter((line) => !line.startsWith("session_id:") && !line.startsWith("⚠"))
    .join("\n")
    .trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) {
    throw new Error(`Sharon did not return JSON: ${cleaned.slice(0, 300)}`);
  }
  return JSON.parse(cleaned.slice(first, last + 1));
}

async function translateViaLocalSharon(kind: ContentKind, fields: TranslationFields) {
  const prompt = [
    "You are Sharon, JoJoe San's English-Thai translation specialist.",
    "Translate the Thai JSON field values into natural, polished English.",
    "Preserve names, numbers, dates, URLs, and IDs exactly.",
    "Return STRICT JSON only, with the same keys. No markdown, no explanation.",
    `Content kind: ${kind}`,
    `Thai JSON: ${JSON.stringify(fields)}`,
  ].join("\n");

  const { stdout } = await execFileAsync("sharon", ["chat", "-q", prompt, "-Q"], {
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  return extractJsonObject(stdout);
}

export async function translateThaiFieldsToEnglish(kind: ContentKind, fields: TranslationFields): Promise<TranslationFields> {
  if (Object.keys(fields).length === 0) return {};

  const bridgeUrl = clean(process.env.SHARON_TRANSLATION_URL);
  const translations = bridgeUrl
    ? await translateViaHttpBridge(kind, fields, bridgeUrl)
    : await translateViaLocalSharon(kind, fields);

  const normalized: TranslationFields = {};
  for (const key of Object.keys(fields)) {
    const translated = clean(translations[key]);
    if (!translated) {
      throw new Error(`Sharon translation missing required field: ${key}`);
    }
    normalized[key] = translated;
  }
  return normalized;
}
