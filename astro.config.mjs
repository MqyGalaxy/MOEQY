import { defineConfig } from 'astro/config';

export default defineConfig({
  // Custom-domain deployment uses /, not the repository prefix /MOEQY/.
  site: 'https://www.moeqy.com',
  output: 'static',
  outDir: './dist',
  build: { format: 'directory' },
  trailingSlash: 'always',
});
