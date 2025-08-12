module.exports = {
  root: true,
  env: { node: true, es2024: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module', // ESM
    project: false,       // pas de type-aware linting pour rester rapide
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended', // active plugin prettier + règle "prettier/prettier"
  ],
  ignorePatterns: [
    'dist/',
    'out/',
    'data/',
    '**/*.js', // on lint surtout les .ts compilés → évite les .js émis
    'node_modules/',
  ],
  rules: {
    // ton style perso ici si besoin
    '@typescript-eslint/no-explicit-any': 'off',
    'prettier/prettier': 'warn',
  },
  overrides: [
    {
      files: ['**/*.ts'],
      rules: {
        // exemples si tu veux plus strict/relax
      },
    },
  ],
};
