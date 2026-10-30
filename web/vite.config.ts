import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // The browser only ever talks to the Vite origin, so the session
      // cookie stays first-party in dev. Inside Compose the api container is
      // reachable as http://api:3000; on the host it is localhost:3000.
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    // Default environment; component tests opt into jsdom per file with a
    // `// @vitest-environment jsdom` docblock.
    environment: 'node',
  },
});
