import { getApiBase } from '../config/apiBase';

const base = () => getApiBase();

export async function fetchAiStatus() {
  try {
    const res = await fetch(`${base()}/api/ai/status`);
    return res.ok ? res.json() : { online: false };
  } catch {
    return { online: false };
  }
}

export async function fetchCopilot(body) {
  const res = await fetch(`${base()}/api/ai/copilot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function fetchModePrompt(mode, interest, language) {
  const res = await fetch(`${base()}/api/ai/mode-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, interest, language }),
  });
  return res.json();
}

export async function polishCaption(text) {
  const res = await fetch(`${base()}/api/ai/caption-polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function fetchTrustScore() {
  try {
    const res = await fetch(`${base()}/api/trust/me`);
    return res.ok ? res.json() : { score: 50, level: 'neutral', badges: [] };
  } catch {
    return { score: 50, level: 'neutral', badges: [] };
  }
}

export async function saveVibeTags(tags) {
  await fetch(`${base()}/api/vibe/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
}

export async function fetchPublicEvents() {
  try {
    const res = await fetch(`${base()}/api/events/public`);
    return res.ok ? res.json() : { events: [] };
  } catch {
    return { events: [] };
  }
}
