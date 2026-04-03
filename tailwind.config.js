/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand palette (retained for globals.css variable definitions only)
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Semantic colors — all theme-aware via CSS variables
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          muted: 'hsl(var(--surface-muted))',
          accent: 'hsl(var(--surface-accent))',
          elevated: 'hsl(var(--surface-elevated))',
          overlay: 'var(--surface-overlay)',
          inset: 'hsl(var(--surface-inset))',
        },
        foreground: {
          DEFAULT: 'hsl(var(--foreground))',
          muted: 'hsl(var(--foreground-muted))',
          subtle: 'hsl(var(--foreground-subtle))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          subtle: 'hsl(var(--accent-subtle))',
          muted: 'hsl(var(--accent-muted))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          subtle: 'hsl(var(--danger-subtle))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          subtle: 'hsl(var(--success-subtle))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          subtle: 'hsl(var(--warning-subtle))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          subtle: 'hsl(var(--info-subtle))',
        },
        border: 'hsl(var(--border))',
        'border-muted': 'hsl(var(--border-muted))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['"Inter"', '"SF Pro Display"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Code"', '"Consolas"', '"SF Mono"', '"Menlo"', 'monospace'],
      },
    },
  },
  plugins: [],
};
