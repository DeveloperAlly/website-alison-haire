// Cloudflare Pages Function: POST /api/ingest
//
// Thin authenticated passthrough so n8n (or any AI pipeline) can push documents
// to your RAG backend WITHOUT exposing that backend publicly. This worker:
//
//   1. Verifies HMAC signature on the request body using INGEST_SHARED_SECRET.
//   2. Forwards the verified body to INGEST_FORWARD_URL (your Supabase Edge
//      Function or n8n webhook).
//   3. Returns whatever the backend returns.
//
// If INGEST_FORWARD_URL is unset, returns 503 — endpoint disabled. This lets you
// keep the worker deployed but inert until your RAG backend exists.
//
// Contract:
//   POST /api/ingest
//   Headers:
//     content-type: application/json
//     x-ingest-signature: hex(hmac-sha256(INGEST_SHARED_SECRET, raw-body))
//     x-ingest-timestamp: <unix-seconds>   (must be within ±5 minutes)
//   Body: any JSON your backend expects. Suggested shape:
//     { docs: Array<{ id, title, source, content, metadata? }> }
//
// Why timestamp + HMAC and not just bearer? Bearer alone replays trivially.
// HMAC over (timestamp + body) makes a leaked request useless after ~5 minutes.

interface Env {
  INGEST_SHARED_SECRET?: string;
  INGEST_FORWARD_URL?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function hexEncode(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Constant-time compare to thwart timing oracles.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return hexEncode(sig);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 1. Endpoint must be explicitly enabled by setting BOTH env vars.
  if (!env.INGEST_SHARED_SECRET) {
    return json({ error: 'not_configured', detail: 'INGEST_SHARED_SECRET missing' }, 503);
  }
  if (!env.INGEST_FORWARD_URL) {
    return json({ error: 'not_configured', detail: 'INGEST_FORWARD_URL missing' }, 503);
  }

  // 2. Extract auth headers
  const sig = request.headers.get('x-ingest-signature');
  const tsHeader = request.headers.get('x-ingest-timestamp');
  if (!sig || !tsHeader) {
    return json({ error: 'missing_auth_headers' }, 401);
  }

  // 3. Reject stale timestamps (±5 minutes)
  const ts = parseInt(tsHeader, 10);
  if (!Number.isFinite(ts)) return json({ error: 'invalid_timestamp' }, 401);
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 300) {
    return json({ error: 'stale_timestamp', skew: nowSec - ts }, 401);
  }

  // 4. Read body, compute expected HMAC over `${ts}.${rawBody}`
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) {
    return json({ error: 'body_too_large', maxBytes: 1_000_000 }, 413);
  }
  const expected = await hmacHex(env.INGEST_SHARED_SECRET, `${ts}.${rawBody}`);
  if (!safeEqual(sig.toLowerCase(), expected)) {
    return json({ error: 'invalid_signature' }, 401);
  }

  // 5. Forward to backend (Supabase Edge Function or n8n webhook).
  //    We strip the auth headers — the forwarded request stands on its own.
  try {
    const fwd = await fetch(env.INGEST_FORWARD_URL, {
      method: 'POST',
      headers: {
        'content-type': request.headers.get('content-type') ?? 'application/json',
      },
      body: rawBody,
    });
    const text = await fwd.text();
    return new Response(text, {
      status: fwd.status,
      headers: {
        'content-type': fwd.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return json(
      { error: 'forward_failed', detail: err instanceof Error ? err.message : 'unknown' },
      502
    );
  }
};

export const onRequest: PagesFunction = async () => {
  return json({ error: 'method_not_allowed' }, 405);
};
