// Cloudflare Pages Function: POST /api/ally
//
// Proxies visitor questions to OpenRouter, grounded in the CAG context the
// browser sends in the request. Keeps the API key server-side.
//
// Contract:
//   POST /api/ally
//   body: { message: string, context?: string, ragChunks?: string[] }
//   200:  { reply: string, model: string }
//   400:  { error: "..."  }   (validation)
//   429:  { error: "rate_limit", retryAfter: number }
//   500:  { error: "upstream", detail?: string }
//
// `context` = CAG bundle (Ally voice + facts, ~1KB markdown).
// `ragChunks` = optional retrieved passages your RAG service injects. The
//   client does NOT send these today; left in the schema so a future
//   server-side enrichment step can add them without changing the contract.

interface Env {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_FALLBACK_MODEL?: string;
  ALLY_RATE_LIMIT_PER_DAY?: string;
  ALLY_MAX_INPUT_CHARS?: string;
  ALLY_RATE_KV?: KVNamespace;
}

interface ReqBody {
  message?: unknown;
  context?: unknown;
  ragChunks?: unknown;
}

const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const DEFAULT_RATE_LIMIT = 20;
const DEFAULT_MAX_INPUT = 600;

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function utcDateKey(): string {
  // YYYY-MM-DD in UTC — bucket for per-day rate-limit
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

interface RateCheck {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

async function checkAndIncrementRate(env: Env, ip: string, limit: number): Promise<RateCheck> {
  // KV binding `ALLY_RATE_KV` is optional. If not configured, allow all (with a console warn).
  if (!env.ALLY_RATE_KV) {
    console.warn('[ally] ALLY_RATE_KV not bound — rate limiting disabled');
    return { ok: true, remaining: limit, retryAfterSec: 0 };
  }
  const key = `ally:${utcDateKey()}:${ip}`;
  const current = await env.ALLY_RATE_KV.get(key);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= limit) {
    // seconds until end of UTC day
    const now = new Date();
    const endOfDay = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1
    );
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((endOfDay - now.getTime()) / 1000) };
  }
  // TTL = 26h to be safe across DST and boundary effects
  await env.ALLY_RATE_KV.put(key, String(count + 1), { expirationTtl: 60 * 60 * 26 });
  return { ok: true, remaining: limit - count - 1, retryAfterSec: 0 };
}

function buildSystemPrompt(context: string, ragChunks: string[]): string {
  let prompt = context.trim();
  if (ragChunks.length > 0) {
    prompt += '\n\nRELEVANT RETRIEVED PASSAGES:\n';
    prompt += ragChunks.map((c, i) => `[${i + 1}] ${c}`).join('\n');
  }
  return prompt;
}

async function callOpenRouter(
  env: Env,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<{ ok: true; reply: string } | { ok: false; status: number; detail: string }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      // Required-ish by OpenRouter for analytics; harmless when set.
      'http-referer': 'https://alisonhaire.com',
      'x-title': "Ally — Alison Haire's site assistant",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 200,
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, status: res.status, detail };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) return { ok: false, status: 502, detail: 'empty completion' };
  return { ok: true, reply };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 1. Parse + validate body
  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const maxInput = parseInt(env.ALLY_MAX_INPUT_CHARS || `${DEFAULT_MAX_INPUT}`, 10);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return json({ error: 'message_required' }, 400);
  if (message.length > maxInput) return json({ error: 'message_too_long', max: maxInput }, 400);

  const context = typeof body.context === 'string' ? body.context : '';
  const ragChunks = Array.isArray(body.ragChunks)
    ? body.ragChunks.filter((c): c is string => typeof c === 'string').slice(0, 8)
    : [];

  // 2. Rate limit
  const limit = parseInt(env.ALLY_RATE_LIMIT_PER_DAY || `${DEFAULT_RATE_LIMIT}`, 10);
  const ip = clientIp(request);
  const rate = await checkAndIncrementRate(env, ip, limit);
  if (!rate.ok) {
    return json(
      { error: 'rate_limit', retryAfter: rate.retryAfterSec },
      429,
      { 'retry-after': String(rate.retryAfterSec) }
    );
  }

  // 3. Check we have a key (early friendly error if misconfigured)
  if (!env.OPENROUTER_API_KEY) {
    return json({ error: 'not_configured', detail: 'OPENROUTER_API_KEY missing' }, 500);
  }

  // 4. Call OpenRouter (with fallback model)
  const systemPrompt = buildSystemPrompt(context, ragChunks);
  const primary = env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const fallback = env.OPENROUTER_FALLBACK_MODEL;

  let result = await callOpenRouter(env, primary, systemPrompt, message);
  if (!result.ok && fallback && fallback !== primary) {
    console.warn(`[ally] primary model ${primary} failed (${result.status}), trying ${fallback}`);
    result = await callOpenRouter(env, fallback, systemPrompt, message);
  }

  if (!result.ok) {
    return json({ error: 'upstream', detail: result.detail.slice(0, 200) }, 502);
  }

  return json(
    { reply: result.reply, model: primary, remaining: rate.remaining },
    200,
    { 'x-rate-remaining': String(rate.remaining) }
  );
};

// Hard-block any non-POST method so this endpoint is never accidentally GET-cached.
export const onRequest: PagesFunction = async () => {
  return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
};
