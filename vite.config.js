import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/discord-package-analyzer/', // for GitHub Pages: username.github.io/discord-package-analyzer/
  server: { port: 3000 },
});
