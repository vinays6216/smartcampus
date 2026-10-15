import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 5173 matches CLIENT_URL in the backend .env (CORS)
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
