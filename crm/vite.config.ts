import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src/web',
  plugins: [react(), tailwindcss()],
  // El chunk 3D (three + r3f) se carga diferido solo en «Ver oficina»; ~300 kB gzip (meta < 700 kB).
  build: { outDir: '../../dist/web', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: { host: '127.0.0.1', port: 5174, proxy: { '/api': 'http://127.0.0.1:4010' } },
});
