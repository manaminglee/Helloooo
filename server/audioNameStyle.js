const NAME_COLORS = [
  '#f472b6', '#a78bfa', '#34d399', '#38bdf8', '#fbbf24',
  '#fb7185', '#22d3ee', '#e879f9', '#4ade80', '#f97316',
];

const NAME_GRADIENTS = [
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

const GRADIENT_IDS = new Set(NAME_GRADIENTS.map((g) => g.id));

function isValidNameColor(value) {
  const v = String(value || '');
  return NAME_COLORS.includes(v) || GRADIENT_IDS.has(v);
}

function pickNameColor(nameColor) {
  if (isValidNameColor(nameColor)) return nameColor;
  if (NAME_COLORS.includes(nameColor)) return nameColor;
  return NAME_COLORS[Math.floor(Math.random() * NAME_COLORS.length)];
}

module.exports = { NAME_COLORS, NAME_GRADIENTS, isValidNameColor, pickNameColor };
