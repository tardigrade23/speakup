// SpeakUp: the AI English conversation partner behind the app.
//   POST {mode:"chat", scenario, level, explain, messages:[{role,content}]}
//     -> {reply, corrections:[{original,corrected,explanation}], new_words:[{word,meaning}], hint}
//   POST {mode:"feedback", scenario, level, explain, messages}
//     -> {fluency, grammar, vocabulary, level_estimate, summary, strengths[], improve[], practice[]}
// Secrets (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  required
// Passcode: requests must send the value of public.app_config 'passcode' (or the
// APP_PASSCODE secret, if set) in the x-app-passcode header, so nobody else can
// spend the API credit. The table is readable only with the service role key.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// The passcode is read from the database and cached for a minute.
let passcode = { value: Deno.env.get('APP_PASSCODE') || '', at: 0 };
async function getPasscode(): Promise<string | null> {
  if (Deno.env.get('APP_PASSCODE')) return passcode.value;
  if (passcode.value && Date.now() - passcode.at < 60_000) return passcode.value;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_config?key=eq.passcode&select=value`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const rows = res.ok ? await res.json() : [];
    passcode = { value: rows[0]?.value || '', at: Date.now() };
    return passcode.value;
  } catch {
    return passcode.value || null;
  }
}
const MODEL = 'claude-opus-5-5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-passcode',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SCENARIOS: Record<string, string> = {
  free: 'Free conversation. Talk about anything the learner brings up: their day, hobbies, plans, opinions. Be a curious, friendly conversation partner.',
  daily: 'Daily routine. Ask about the learner\'s day: what they did, ate, plan to do, how they feel.',
  interview: 'Job interview. You are a hiring manager at an international tech company interviewing the learner. Ask one interview question at a time, follow up on their answers, and keep it realistic.',
  it: 'Tech talk. You are a friendly software engineer colleague. Chat about technology, programming, AI, startups and digital government. Use common workplace English.',
  travel: 'Travel. Play the people a traveller meets: airport check-in staff, passport control, hotel receptionist, a local giving directions. Switch roles naturally as the trip goes on.',
  restaurant: 'Restaurant and café. You are a waiter. Take the order, recommend dishes, handle a small problem with the order, bring the bill.',
  shopping: 'Shopping. You are a shop assistant. Help the learner find clothes or electronics, talk about sizes, prices, returns.',
  doctor: 'At the doctor. You are a family doctor. Ask about symptoms, give simple advice. Keep it light and non-alarming.',
  smalltalk: 'Small talk. You meet the learner at an international conference coffee break. Practise introductions, where are you from, what do you do, weather, plans.',
  debate: 'Friendly debate. Pick a light, interesting topic (e.g. remote work vs office, cities vs villages, AI in schools), take the opposite side of the learner, and push them to give reasons and examples.',
  story: 'Storytelling. Ask the learner to tell you about a memorable experience (a trip, a funny moment, a challenge). Ask follow-up questions that make them use past tenses and describe details.',
};

const LEVELS: Record<string, string> = {
  A2: 'A2 (elementary): use very short, simple sentences and the 1000 most common words. Speak slowly and clearly.',
  B1: 'B1 (intermediate): use simple everyday language, short sentences, and occasionally a useful new phrase.',
  B2: 'B2 (upper-intermediate): use natural, fluent English with common idioms and phrasal verbs.',
  C1: 'C1 (advanced): speak like a native, with rich vocabulary, idioms and nuance.',
};

const EXPLAIN: Record<string, string> = {
  az: 'Azerbaijani (Azərbaycan dili)',
  en: 'simple English',
  ru: 'Russian',
  tr: 'Turkish',
};

const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Your spoken reply in English, as the conversation partner.' },
    corrections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          original: { type: 'string' },
          corrected: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['original', 'corrected', 'explanation'],
        additionalProperties: false,
      },
    },
    new_words: {
      type: 'array',
      items: {
        type: 'object',
        properties: { word: { type: 'string' }, meaning: { type: 'string' } },
        required: ['word', 'meaning'],
        additionalProperties: false,
      },
    },
    hint: { type: 'string', description: 'A short example of what the learner could say next, in English.' },
  },
  required: ['reply', 'corrections', 'new_words', 'hint'],
  additionalProperties: false,
};

const FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    fluency: { type: 'integer', description: '1-10' },
    grammar: { type: 'integer', description: '1-10' },
    vocabulary: { type: 'integer', description: '1-10' },
    level_estimate: { type: 'string', description: 'CEFR level, e.g. B1' },
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    improve: { type: 'array', items: { type: 'string' } },
    practice: { type: 'array', items: { type: 'string' }, description: 'Useful English phrases to practise, with a short translation.' },
  },
  required: ['fluency', 'grammar', 'vocabulary', 'level_estimate', 'summary', 'strengths', 'improve', 'practice'],
  additionalProperties: false,
};

function chatSystem(scenario: string, level: string, explain: string) {
  return `You are SpeakUp, a warm, patient English conversation partner for a learner from Azerbaijan who wants to improve their spoken English.

Scenario: ${SCENARIOS[scenario] || SCENARIOS.free}
Learner level: ${LEVELS[level] || LEVELS.B1}

How to talk:
- This is a spoken conversation: your reply is read aloud by text-to-speech. Keep it to 1-3 short sentences, no lists, no markdown, no emoji.
- Stay in the scenario and keep the conversation going: almost always end with one question for the learner.
- Never lecture inside the reply. If the learner made a mistake, you may naturally echo the correct form once, but put the teaching in "corrections".
- The learner's messages often come from speech recognition, so ignore missing punctuation, capital letters and obvious recognition slips; correct only real grammar, word choice and phrasing mistakes.

Corrections (for the learner's latest message only):
- List up to 3 real mistakes or very unnatural phrases. If the message is fine, return an empty list.
- "original" is the learner's words, "corrected" a natural version, "explanation" one short sentence in ${EXPLAIN[explain] || EXPLAIN.az}.

new_words: 0-2 useful words or phrases you used in your reply that may be new at this level, with the meaning in ${EXPLAIN[explain] || EXPLAIN.az}.
hint: one short, natural sentence the learner could answer with (in English, at their level).`;
}

function feedbackSystem(level: string, explain: string) {
  return `You are an experienced English speaking coach. Below is a practice conversation between a learner (user) and an AI partner (assistant). The learner's lines come from speech recognition, so ignore punctuation and capitalisation.
The learner chose level ${level || 'B1'}. Evaluate only the learner's English.
Give scores 1-10 for fluency, grammar and vocabulary, an estimated CEFR level, and write summary, strengths (2-3) and improve (2-4, concrete, with an example of the correct form) in ${EXPLAIN[explain] || EXPLAIN.az}. In "practice" give 3-5 useful English phrases from this topic, each followed by " — " and a short translation into ${EXPLAIN[explain] || EXPLAIN.az}. Be encouraging and honest.`;
}

type Msg = { role: 'user' | 'assistant'; content: string };

function cleanMessages(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-40);
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]) {
  return content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const code = await getPasscode();
  if (code === null) return json({ error: 'config' }, 500);
  if (code && req.headers.get('x-app-passcode') !== code) return json({ error: 'passcode' }, 401);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: 'bad_request' }, 400);
  const mode = body.mode === 'feedback' ? 'feedback' : 'chat';
  const scenario = String(body.scenario || 'free');
  const level = String(body.level || 'B1');
  const explain = String(body.explain || 'az');
  let messages = cleanMessages(body.messages);

  if (mode === 'chat') {
    // Claude expects alternating turns that start with the user.
    if (!messages.length || messages[0].role !== 'user') {
      messages = [{ role: 'user', content: '(The learner has just opened the app. Greet them in one short sentence and ask your first question for this scenario.)' }, ...messages];
    }
    if (messages[messages.length - 1].role !== 'user') return json({ error: 'last_message_must_be_user' }, 400);
  } else {
    if (!messages.some((m) => m.role === 'user')) return json({ error: 'empty' }, 400);
  }

  const request = mode === 'chat'
    ? { system: chatSystem(scenario, level, explain), messages, schema: CHAT_SCHEMA, effort: 'low' as const }
    : {
      system: feedbackSystem(level, explain),
      messages: [{ role: 'user' as const, content: messages.map((m) => `${m.role === 'user' ? 'Learner' : 'Partner'}: ${m.content}`).join('\n') }],
      schema: FEEDBACK_SCHEMA,
      effort: 'medium' as const,
    };

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: request.system,
      messages: request.messages,
      output_config: { effort: request.effort, format: { type: 'json_schema', schema: request.schema } },
    });
    if (response.stop_reason === 'refusal') return json({ error: 'refusal' }, 422);
    const data = JSON.parse(textOf(response.content));
    return json(data);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'rate_limit' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'server_key' }, 500);
    if (e instanceof Anthropic.APIError) {
      console.error('Claude API error', e.status, e.message);
      if (/credit balance/i.test(e.message)) return json({ error: 'no_credit' }, 402);
      return json({ error: 'api', status: e.status, message: e.message }, 502);
    }
    if (e instanceof SyntaxError) return json({ error: 'bad_model_output' }, 502);
    return json({ error: 'network' }, 502);
  }
});
