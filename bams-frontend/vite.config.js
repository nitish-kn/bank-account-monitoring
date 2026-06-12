import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server:{
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok-free.io', '.ngrok-free.live', '.ngrok-free.net', '.ngrok-free.org']
  },
  optimizeDeps: {
    include: ['recharts'], // Forces Vite to pre-bundle Recharts cleanly
  },
})
