export const NAME_COLORS = [
  '#f472b6', '#a78bfa', '#34d399', '#38bdf8', '#fbbf24',
  '#fb7185', '#22d3ee', '#e879f9', '#4ade80', '#f97316',
];

export const NAME_GRADIENTS = [
  { id: 'grad:aurora', label: 'Aurora', css: 'linear-gradient(135deg, #22d3ee, #a78bfa, #f472b6)' },
  { id: 'grad:sunset', label: 'Sunset', css: 'linear-gradient(135deg, #f97316, #fb7185, #fbbf24)' },
  { id: 'grad:neon', label: 'Neon', css: 'linear-gradient(135deg, #4ade80, #22d3ee, #38bdf8)' },
  { id: 'grad:royal', label: 'Royal', css: 'linear-gradient(135deg, #6366f1, #a78bfa, #e879f9)' },
  { id: 'grad:rose', label: 'Rose', css: 'linear-gradient(135deg, #fb7185, #f472b6, #e879f9)' },
  { id: 'grad:ocean', label: 'Ocean', css: 'linear-gradient(135deg, #0ea5e9, #34d399, #22d3ee)' },
  { id: 'grad:fire', label: 'Fire', css: 'linear-gradient(135deg, #ef4444, #f97316, #fbbf24)' },
  { id: 'grad:galaxy', label: 'Galaxy', css: 'linear-gradient(135deg, #312e81, #7c3aed, #ec4899)' },
  { id: 'grad:mint', label: 'Mint', css: 'linear-gradient(135deg, #6ee7b7, #34d399, #14b8a6)' },
  { id: 'grad:candy', label: 'Candy', css: 'linear-gradient(135deg, #f9a8d4, #c084fc, #818cf8)' },
];

const GRADIENT_MAP = Object.fromEntries(NAME_GRADIENTS.map((g) => [g.id, g]));

export function isGradientNameColor(value) {
  return String(value || '').startsWith('grad:');
}

export function isValidNameColor(value) {
  const v = String(value || '');
  return NAME_COLORS.includes(v) || !!GRADIENT_MAP[v];
}

export function resolveNameStyle(nameColor) {
  const v = nameColor || '#e2e8f0';
  const grad = GRADIENT_MAP[v];
  if (grad) {
    return {
      backgroundImage: grad.css,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    };
  }
  return { color: v };
}

/** First accent from gradient or solid hex — for rings, shadows, etc. */
export function primaryNameColor(nameColor) {
  const v = nameColor || '#e2e8f0';
  const grad = GRADIENT_MAP[v];
  if (grad) {
    const match = grad.css.match(/#[0-9a-fA-F]{3,8}/);
    return match?.[0] || '#f472b6';
  }
  return v;
}
