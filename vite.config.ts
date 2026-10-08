import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Set HTTPS=1 to serve the dev client over self-signed HTTPS on your LAN.
// Phones refuse camera/mic access on plain http:// unless it's localhost.
const useHttps = process.env.HTTPS === '1';

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': { target: 'http://localhost:3001' },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
