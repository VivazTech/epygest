import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [react()],
  // Não injetar segredos do servidor via `define` — isso os embutiria no bundle público.
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
}));
