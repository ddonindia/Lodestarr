import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['lucide-react', '@headlessui/react', 'react-hot-toast'],
          'vendor-charts': ['recharts'],
          'vendor-utils': ['date-fns', 'clsx'],
        },
      },
    },
  },
})
