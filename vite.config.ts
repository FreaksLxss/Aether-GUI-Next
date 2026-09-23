import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        "log-window": path.resolve(__dirname, "log-window.html"),
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three"
          if (id.includes("node_modules/motion")) return "motion"
          if (id.includes("node_modules/radix-ui") || id.includes("node_modules/radix")) return "radix"
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
})
