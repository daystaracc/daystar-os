import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/** DAYSTAR OS design tokens. Colors come from CSS variables in src/styles/globals.css so themes stay in one place. */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem', screens: { '2xl': '1440px' } },
    extend: {
      colors: {
        bg: 'hsl(var(--bg))', surface: 'hsl(var(--surface))', muted: 'hsl(var(--muted))', border: 'hsl(var(--border))', 'border-strong': 'hsl(var(--border-strong))',
        ink: 'hsl(var(--ink))', 'ink-2': 'hsl(var(--ink-2))', 'ink-3': 'hsl(var(--ink-3))',
        brand: { brown: 'hsl(var(--brand-brown))', gold: 'hsl(var(--brand-gold))', cream: 'hsl(var(--brand-cream))', stone: 'hsl(var(--brand-stone))' },
        ok: { DEFAULT: 'hsl(var(--ok))', soft: 'hsl(var(--ok-soft))' },
        warn: { DEFAULT: 'hsl(var(--warn))', soft: 'hsl(var(--warn-soft))' },
        bad: { DEFAULT: 'hsl(var(--bad))', soft: 'hsl(var(--bad-soft))' },
        accent: { DEFAULT: 'hsl(var(--accent))', soft: 'hsl(var(--accent-soft))' },
      },
      borderRadius: { sm: 'var(--r-sm)', md: 'var(--r-md)', lg: 'var(--r-lg)', xl: 'var(--r-xl)' },
      boxShadow: { card: 'var(--shadow-card)', pop: 'var(--shadow-pop)', drawer: 'var(--shadow-drawer)' },
      fontFamily: { sans: ['var(--font-geist-sans)', 'var(--font-noto-tc)', 'system-ui', 'sans-serif'], mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'] },
      fontSize: {
        kpi: ['2rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
        'kpi-lg': ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '600' }],
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.06em', fontWeight: '500' }],
      },
      spacing: { 4.5: '1.125rem', 13: '3.25rem', 15: '3.75rem', 18: '4.5rem', 'sidebar': '15rem', 'sidebar-collapsed': '4rem' },
      transitionDuration: { fast: '120ms', base: '180ms', slow: '260ms' },
      keyframes: { 'fade-up': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } } },
      animation: { 'fade-up': 'fade-up 180ms ease-out both' },
    },
  },
  plugins: [animate],
};
export default config;
