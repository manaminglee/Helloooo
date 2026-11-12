/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        display: ['Syne', 'Outfit', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        realm: {
          void: '#12100e',
          surface: '#1b1714',
          card: '#241e18',
          border: 'rgba(246, 236, 220, 0.14)',
          muted: 'rgba(246, 241, 232, 0.55)',
          teal: '#8fbfa8',
          mint: '#b7d7c8',
          coral: '#e37b6a',
          gold: '#f0c48a',
          amber: '#e8b56a',
          glow: 'rgba(232, 181, 106, 0.18)',
        },
        indigo: {
          50: '#fff8ef',
          100: '#ffedd4',
          200: '#f8d7a8',
          300: '#f0c27a',
          400: '#e4a85a',
          500: '#d4923c',
          600: '#b8752c',
          700: '#8c5822',
          800: '#633e18',
          900: '#3e2710',
        },
        violet: {
          50: '#fff8ef',
          100: '#ffedd4',
          200: '#f8d7a8',
          300: '#f0c27a',
          400: '#e4a85a',
          500: '#d4923c',
          600: '#b8752c',
          700: '#8c5822',
          800: '#633e18',
          900: '#3e2710',
        },
        fuchsia: {
          300: '#f3c7a4',
          400: '#e7a27a',
          500: '#d4895c',
          600: '#b86d42',
        },
        purple: {
          300: '#f0c27a',
          400: '#e4a85a',
          500: '#c9843a',
          600: '#a86a2c',
        },
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #7c3aed, #e879f9)',
        'gradient-teal': 'linear-gradient(135deg, #14b8a6, #2dd4bf)',
        'gradient-hero': 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(167,139,250,0.18), transparent)',
        'mm-noise':
          'radial-gradient(ellipse 100% 80% at 50% -20%, rgba(124,58,237,0.2), transparent 55%)',
      },
      animation: {
        'fade-in': 'fade-in 0.6s ease-out both',
        'fade-in-up': 'fade-in-up 0.6s ease-out both',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.215, 0.61, 0.355, 1) infinite',
        'bounce-dot': 'bounce-dot 1.2s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 0.4s ease-out both',
        'message-pop': 'message-pop 0.25s ease-out both',
        'gradient-shift': 'gradient-shift 3s ease infinite',
        connecting: 'connecting-pulse 2s ease infinite',
        shimmer: 'shimmer 1.5s linear infinite',
        'dot-pulse': 'dot-pulse 3s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.95)', opacity: '0.8' },
          '70%': { transform: 'scale(1.15)', opacity: '0' },
          '100%': { transform: 'scale(1.15)', opacity: '0' },
        },
        'bounce-dot': {
          '0%, 100%': { transform: 'translateY(0)', opacity: '0.5' },
          '50%': { transform: 'translateY(-8px)', opacity: '1' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(30px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'message-pop': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'connecting-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(167, 139, 250, 0.5)' },
          '50%': { boxShadow: '0 0 0 16px rgba(167, 139, 250, 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'dot-pulse': {
          '0%, 100%': { opacity: '0.3', transform: 'scale(1)' },
          '50%': { opacity: '0.9', transform: 'scale(1.2)' },
        },
      },
      boxShadow: {
        'glow-indigo': '0 0 22px rgba(167, 139, 250, 0.32)',
        'glow-teal': '0 0 20px rgba(45, 212, 191, 0.3)',
        'glow-red': '0 0 20px rgba(244, 63, 94, 0.3)',
        card: '0 8px 32px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
};
