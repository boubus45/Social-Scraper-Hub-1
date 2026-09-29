// Shared Bright Data HTTP plumbing: authentication and response parsing.
// Both the collection manager and the on-demand profile service go through
// here so a payload is interpreted exactly one way.

export const BRIGHTDATA_API = 'https://api.brightdata.com';

export function brightDataToken(): string {
  return process.env.BRIGHTDATA_API_TOKEN ?? '';
}

export function isConfigured(): boolean {
  return !!brightDataToken();
}

/** Authenticated request against api.brightdata.com. */
export async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BRIGHTDATA_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${brightDataToken()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

function isReadySentinel(doc: Record<string, unknown>): boolean {
  // {"status":"building","message":"…"} / {"status":"running"} / {"status":"collecting"}
  const status = doc.status;
  return (
    typeof status === 'string' &&
    ['building', 'running', 'collecting', 'pending', 'processing', 'queued'].includes(status)
  );
}

function toRecords(doc: unknown): unknown[] {
  if (Array.isArray(doc)) return doc;
  if (doc && typeof doc === 'object') {
    const record = doc as Record<string, unknown>;
    if (isReadySentinel(record)) return [];
    return [doc];
  }
  return [];
}

/**
 * Bright Data answers in three shapes: a JSON array (dataset snapshots), a
 * single object, or several JSON documents concatenated line by line (Scraper
 * Studio writes one record per line). Not-ready sentinels parse to an empty
 * array so callers can keep polling.
 */
export function parseDatasetPayload(text: string): unknown[] {
  const body = text.trim();
  if (!body) return [];

  try {
    const records = toRecords(JSON.parse(body));
    if (records.length > 0) return records;
    // A lone sentinel: fall through in case more documents follow it.
  } catch {
    // Not one document — try line by line below.
  }

  const records: unknown[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(...toRecords(JSON.parse(trimmed)));
    } catch {
      // Ignore unparsable fragments rather than failing the whole batch.
    }
  }

  return records;
}
