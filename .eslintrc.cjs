module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2020: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react', 'react-hooks', '@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    // Relaxed for gradual adoption
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off',
    'react/prop-types': 'off', // Using TypeScript instead
    'react/react-in-jsx-scope': 'off', // React 18 JSX transform
    'no-unused-vars': 'off', // Handled by @typescript-eslint
    'no-useless-escape': 'warn',
    'no-empty': 'warn',
    '@typescript-eslint/no-this-alias': 'warn',
    'react/no-unescaped-entities': 'warn',
  },
  overrides: [
    {
      // Core migration boundary: renderer files should import from @core/operations, not database directly.
      // Using 'warn' during migration — once all legacy sites are migrated, switch to 'error'.
      files: ['src/renderer/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'no-restricted-imports': ['warn', {
          patterns: [{
            group: ['**/database', '**/database/**'],
            message: 'Import from @core/operations instead. See docs/MIGRATION.md',
          }],
        }],
      },
    },
  ],
  ignorePatterns: ['out/', 'node_modules/', 'dll/'],
};
