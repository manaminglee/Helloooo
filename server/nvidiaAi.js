/**
 * Central NVIDIA NIM / integrate.api.nvidia.com client for Mana Mingle.
 */
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const CHAT_MODEL = process.env.NVIDIA_MODEL || 'meta/llama3-70b-instruct';
const FAST_MODEL = process.env.NVIDIA_FAST_MODEL || 'mistralai/mistral-7b-instruct-v0.1';
// Hard ceiling for any outbound AI call so a hung provider can never stall
// message sending / moderation. Overridable via NVIDIA_TIMEOUT_MS.
const AI_TIMEOUT_MS = Number(process.env.NVIDIA_TIMEOUT_MS) || 10000;

async function nvidiaChat(messages, opts = {}) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return { offline: true, error: 'NVIDIA API key not configured' };

  const {
    model = CHAT_MODEL,
    temperature = 0.7,
    max_tokens = 200,
  } = opts;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch(NVIDIA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return { error: `NVIDIA API ${response.status}`, detail: errText.slice(0, 200) };
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    return { content, model };
  } catch (e) {
    if (e?.name === 'AbortError') {
      return { error: `NVIDIA request timed out after ${AI_TIMEOUT_MS}ms`, timeout: true };
    }
    return { error: e.message || 'NVIDIA request failed' };
  } finally {
    clearTimeout(timeout);
  }
}

function cleanLine(s) {
  return String(s || '').replace(/^["'\s]+|["'\s]+$/g, '').replace(/\n+/g, ' ').trim();
}

async function spark(interest) {
  const r = await nvidiaChat([
    { role: 'system', content: 'You are Helloooo AI. One short icebreaker question (max 15 words). No hashtags or quotes.' },
    { role: 'user', content: `Interest: ${interest || 'general'}` },
  ], { max_tokens: 50 });
  return cleanLine(r.content) || 'What made you smile today?';
}

async function quickReplies(lastMessage) {
  const r = await nvidiaChat([
    { role: 'system', content: 'Suggest 3 short chat replies (max 4 words each). Comma-separated only. Example: Sounds fun, Tell me more, Haha nice' },
    { role: 'user', content: `Stranger said: ${lastMessage || 'Hi'}` },
  ], { temperature: 0.8, max_tokens: 40 });
  const parts = cleanLine(r.content).split(',').map((s) => s.trim()).filter(Boolean);
  return parts.slice(0, 3).length ? parts.slice(0, 3) : ['Nice!', 'Go on', 'Haha'];
}

async function translate(text) {
  if (!text) return '';
  const r = await nvidiaChat([
    { role: 'system', content: 'Translate to clear natural English. Output translation only.' },
    { role: 'user', content: text },
  ], { temperature: 0.1, max_tokens: 200 });
  return cleanLine(r.content) || text;
}

async function moderate(text) {
  const r = await nvidiaChat([
    { role: 'system', content: 'Classify if message is safe for anonymous chat. Reply ONLY: SAFE or UNSAFE plus one short reason if unsafe.' },
    { role: 'user', content: text },
  ], { model: FAST_MODEL, temperature: 0, max_tokens: 30 });
  if (r.error) {
    // Fail-open so chat keeps flowing when the AI backend is down/slow — but
    // never silently: always log that moderation was skipped.
    console.warn(`[AI] Moderation fail-open (${r.error}). Message allowed without AI review.`);
    return { safe: true, warning: null, offline: true };
  }
  const line = cleanLine(r.content).toUpperCase();
  const safe = !line.startsWith('UNSAFE');
  return { safe, warning: safe ? null : 'Message may violate community guidelines.' };
}

async function modePrompt(mode, interest, lang) {
  const prompts = {
    language_exchange: `Generate a bilingual language-exchange prompt: 1 line in English and 1 in ${lang || 'Spanish'}. Under 20 words total.`,
    debate: 'Pick a fun, non-controversial debate topic for strangers. One sentence question only.',
    interview: 'Give one friendly mock interview question for practice. One sentence.',
    speed_mingle: 'Give a 3-minute speed-mingle question. One sentence, energetic.',
    story_chain: 'Start a collaborative story with one intriguing opening sentence (max 18 words).',
    two_truths: 'Generate 3 statements for "two truths and a lie" — label them A, B, C. One should be the lie.',
    free: 'One open-ended conversation starter for anonymous chat. Max 15 words.',
  };
  const r = await nvidiaChat([
    { role: 'system', content: prompts[mode] || prompts.free },
    { role: 'user', content: `Interest: ${interest || 'general'}` },
  ], { max_tokens: 120 });
  return cleanLine(r.content) || 'Tell me something good about your week.';
}

async function copilot({ silenceSeconds, mode, interest, lastMessages = [] }) {
  const ctx = lastMessages.slice(-4).map((m) => m.text).join(' | ');
  const r = await nvidiaChat([
    {
      role: 'system',
      content: 'You are a silent co-pilot for anonymous video chat. User had awkward silence. Suggest ONE gentle prompt to restart talk (max 12 words). No lectures.',
    },
    {
      role: 'user',
      content: `Mode: ${mode || 'free'}. Interest: ${interest || 'general'}. Silent for ${silenceSeconds || 0}s. Recent: ${ctx || 'none'}`,
    },
  ], { max_tokens: 40 });
  return cleanLine(r.content) || 'What are you up to today?';
}

async function vibeSummary(topics, durationSec) {
  const r = await nvidiaChat([
    { role: 'system', content: 'Summarize anonymous chat vibe in 6 words max for matchmaking. No names. Example: gaming casual friendly' },
    { role: 'user', content: `Topics: ${topics.join(', ') || 'general'}. Duration: ${durationSec}s` },
  ], { max_tokens: 20 });
  return cleanLine(r.content) || 'friendly social';
}

async function suggestTopics() {
  const r = await nvidiaChat([
    {
      role: 'system',
      content: 'Suggest 5 trending or intriguing short interests/topics for a chat application. Format: Only the words separated by commas. Example: Gaming, Space, AI, Music, Books. No numbers, no extra text.',
    },
  ], { temperature: 0.9, max_tokens: 80 });
  const parts = cleanLine(r.content).split(',').map((s) => s.trim().replace(/[.]/g, '')).filter(Boolean);
  return parts.length ? parts : ['Gaming', 'Music', 'Travel', 'Movies', 'Tech'];
}

async function adminSummary(context) {
  const r = await nvidiaChat([
    {
      role: 'system',
      content: 'You are the Helloooo Admin AI. Analyze the system state and recent errors. Provide a concise (under 100 words), high-impact summary for the administrator. Highlight critical failures or patterns. Use professional yet assertive tone.',
    },
    { role: 'user', content: context },
  ], { model: FAST_MODEL, temperature: 0.2, max_tokens: 250 });
  return cleanLine(r.content) || 'AI analysis complete. No critical patterns identified.';
}

async function polishCaption(raw) {
  const r = await nvidiaChat([
    { role: 'system', content: 'Fix speech-to-text caption grammar. Output corrected line only, max 15 words.' },
    { role: 'user', content: raw },
  ], { model: FAST_MODEL, temperature: 0.1, max_tokens: 40 });
  return cleanLine(r.content) || raw;
}

function isConfigured() {
  return !!process.env.NVIDIA_API_KEY;
}

module.exports = {
  nvidiaChat,
  spark,
  quickReplies,
  translate,
  moderate,
  modePrompt,
  copilot,
  vibeSummary,
  polishCaption,
  suggestTopics,
  adminSummary,
  isConfigured,
};
