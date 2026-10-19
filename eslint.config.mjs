import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
export default [
  { ignores: ['.next/**', 'dist/**', 'node_modules/**', 'public/sw.js'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];
