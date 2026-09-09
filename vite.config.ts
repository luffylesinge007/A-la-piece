import { vlyPlugin } from "@vly-ai/integrations";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vlyPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Enable source maps for better debugging (disable in production if needed)
    sourcemap: false,
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching and lazy loading.
        // Function form (not object form): object manualChunks is rejected by
        // rolldown-based bundlers, which broke the production build with
        // "Importing a module script failed".
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          // Heavy optional libraries - separate chunks for better lazy loading
          if (id.includes('framer-motion')) return 'framer-motion';
          if (id.includes('recharts') || /[\\/]d3-[a-z]/.test(id) || id.includes('victory-vendor')) return 'charts';
          if (id.includes('react-hook-form') || id.includes('@hookform') || /[\\/]zod[\\/]/.test(id)) return 'forms';
          // Large UI library chunks
          if (id.includes('@radix-ui')) return 'radix-ui';
          // Vendor chunks for large libraries
          if (/[\\/]convex[\\/]/.test(id)) return 'convex-vendor';
          if (
            /[\\/]node_modules[\\/]react[\\/]/.test(id) ||
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('scheduler')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
        // Optimize chunk size
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Increase chunk size warning limit for better chunking
    chunkSizeWarningLimit: 1000,
    // Target modern browsers for better optimization
    target: 'esnext',
    // Minify options - using esbuild (faster than terser)
    minify: 'esbuild',
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router',
      '@convex-dev/auth/react',
    ],
  },
  // Performance hints
  server: {
    // Keep HMR on, but disable full-screen error overlay
    hmr: {
      overlay: false,
    },
  },
});
