import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/ol/") || id.includes("\\ol\\")) return "openlayers";
          if (id.includes("recharts")) return "recharts";
          if (id.includes("d3-") || id.includes("victory-vendor")) return "d3-charts";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("\\react\\") || id.includes("scheduler")) {
            return "react-vendor";
          }
          if (id.includes("lucide-react") || id.includes("proj4") || id.includes("zustand")) {
            return "ui-vendor";
          }
        },
      },
    },
  },
});
