import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // mettiamo direttamente la build dentro la cartella dell'estensione
    outDir: '../chrome-ext/ui-panel',
    // non svuotare cartelle fuori dal progetto
    emptyOutDir: false,
  },
});
