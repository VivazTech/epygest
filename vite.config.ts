import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // IMPORTANTE: não injetar segredos do servidor (GEMINI_API_KEY, chaves Supabase,
    // JWT_SECRET) via `define` — isso os embutiria no bundle público do navegador.
    // Chaves de IA/banco devem ser usadas apenas no backend (server.ts / src/app.ts).
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
