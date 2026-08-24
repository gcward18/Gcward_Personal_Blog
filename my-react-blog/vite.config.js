import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    hot: true, // Enables HMR
    open: true, // Automatically opens browser on startup
  },
});