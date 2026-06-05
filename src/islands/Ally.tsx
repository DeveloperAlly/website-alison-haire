// Floating AI assistant "Ally".
// CAG context is passed in as a prop from Layout (read from src/content/ally/context.md at build time).
// Runtime: posts to /api/ally with { message, context? }.
// Your separate RAG service can later inject retrieved chunks via the context param.

import { useEffect, useRef, useState } from 'react';
import {
  X as XIcon,
  ArrowUp,
  Sparkles,
} from 'lucide-react';

interface Props {
  contextMarkdown: string;
}

interface Message {
  who: 'me' | 'bot';
  text: string;
}

const SUGGESTIONS = [
  "What does Alison actually do?",
  "Tell me about Lilypad",
  "What is she open to right now?",
  "What is the arXiv paper about?",
];

// Fallback answers (keyword-matched) for when the API is unreachable.
// Voice stays intact; UK English; no em-dashes; 2-4 sentences.
const FALLBACK: Array<[RegExp, string]> = [
  [/lilypad/i,                                "Lilypad was my 0→1: a decentralised GPU compute network for AI. I founded and ran it from a single Filecoin smart contract to globally deployed, open-source infrastructure across thousands of nodes, owning product, fundraising, partnerships and the developer story."],
  [/rag|cag|pipeline|assistant/i,             "This assistant runs on my own RAG/CAG pipeline. Retrieval (RAG) pulls the facts, a cached context bundle (CAG) carries the voice. That is how I sound like me, not a generic bot."],
  [/arxiv|paper|research|publish/i,           "I co-authored arXiv:2501.05374, proposing binary and ternary consensus frameworks for verifying non-deterministic GPU workloads on trustless networks. Directly relevant to confidential, privacy-preserving compute."],
  [/open to|hiring|work with|available|advis|fractional/i, "I am open to advising, fractional product leadership, and trading notes on where AI is going. The fastest path is booking a 30-min call on the Contact page, or email contact@alisonhaire.com."],
  [/do|role|what.*you|about/i,                "Short version: I take research-grade AI and turn it into products people can use, buy, and believe in. Three things, held together: products, strategy and story. Founder of Lilypad; prev. Protocol Labs, IBM, Accenture."],
  [/talk|speak|keynote|podcast/i,             "I have given 30+ talks. The mainstage keynote at ETH Devconnect Istanbul, launching the testnet live on stage, is the one to watch. I co-host Tech Jam and have guested on DevNTell, Crypto Hipster and others. See the Speaking page."],
  [/cafe|coffee|start|background|story/i,     "I owned and ran a café for seven years, taught myself to code on the slow afternoons, and never looked back. Mechatronics and philosophy degrees, then Accenture → IBM → Protocol Labs → Lilypad."],
  [/project|build|ship/i,                     "A few: Lilypad Network (decentralised compute), Waterlily.ai, the Olas Research Agent, my RAG/CAG pipeline, the GPU-verification arXiv paper, and Lilypad v0 (the FVM x Bacalhau bridge). The Projects page has the details."],
];

function fallback(q: string): string {
  for (const [re, ans] of FALLBACK) if (re.test(q)) return ans;
  return "Good question. I would point you to the page that covers it, or you can book a quick call via Contact and ask me directly. I keep this honest, so I will not invent specifics I do not have. ✦";
}

export default function Ally({ contextMarkdown }: Props) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Message[]>([
    {
      who: 'bot',
      text:
        "Hi, I'm Ally, the AI on Alison's site. Ask me about her work, projects, talks, or what she is open to. I am trained on her voice, so this should feel like talking to a knowledgeable version of her.",
    },
  ]);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [msgs, busy, open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setVal('');
    setMsgs((m) => [...m, { who: 'me', text: q }]);
    setBusy(true);

    let answer = '';
    try {
      const res = await fetch('/api/ally', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: q,
          // CAG bundle goes with every request. Your RAG pipeline can later
          // append retrieved chunks server-side; we pass the static piece here.
          context: contextMarkdown,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { reply?: string };
        answer = data.reply?.trim() ?? '';
      }
    } catch {
      // network error — fall through to fallback below
    }

    if (!answer) answer = fallback(q);

    setMsgs((m) => [...m, { who: 'bot', text: answer }]);
    setBusy(false);
  }

  const showSugg = msgs.length <= 1 && !busy;

  return (
    <div className="ally">
      {open ? (
        <div className="ally__panel" role="dialog" aria-label="Ask Ally's AI">
          <div className="ally__head">
            <div className="av">
              <div className="ring"></div>
              <img src="/assets/alison-avatar.png" alt="" />
            </div>
            <div className="who">
              <b>Ally</b>
              <span><span className="live"></span>Alison's AI · online</span>
            </div>
            <button className="x" onClick={() => setOpen(false)} aria-label="Close">
              <XIcon size={18} />
            </button>
          </div>

          <div className="ally__log" ref={logRef}>
            {msgs.map((m, i) => (
              <div className={`msg ${m.who}`} key={i}>{m.text}</div>
            ))}
            {busy && (
              <div className="msg bot typing">
                <span></span><span></span><span></span>
              </div>
            )}
          </div>

          {showSugg && (
            <div className="ally__sugg">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          )}

          <form
            className="ally__form"
            onSubmit={(e) => {
              e.preventDefault();
              ask(val);
            }}
          >
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder="Ask about Alison's work…"
              aria-label="Message"
            />
            <button type="submit" disabled={busy || !val.trim()} aria-label="Send">
              <ArrowUp size={18} />
            </button>
          </form>
        </div>
      ) : (
        <button className="ally__pill" onClick={() => setOpen(true)}>
          Ask Ally's AI <Sparkles size={14} className="spark" />
        </button>
      )}
    </div>
  );
}
