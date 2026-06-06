export function parseLimit(value: string | null, fallback = 100, max = 500) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function parseOffset(value: string | null) {
  const parsed = Number.parseInt(value || "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function money(value: unknown, fieldName = "amount") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    const err: any = new Error(`${fieldName} must be a non-negative number`);
    err.status = 400;
    throw err;
  }
  return parsed.toFixed(2);
}

export function positiveMoney(value: unknown, fieldName = "amount") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    const err: any = new Error(`${fieldName} must be greater than zero`);
    err.status = 400;
    throw err;
  }
  return parsed.toFixed(2);
}

export function requiredString(value: unknown, fieldName: string) {
  const text = String(value || "").trim();
  if (!text) {
    const err: any = new Error(`${fieldName} is required`);
    err.status = 400;
    throw err;
  }
  return text;
}

export function optionalDate(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

export function badRequest(message: string): never {
  const err: any = new Error(message);
  err.status = 400;
  throw err;
}
