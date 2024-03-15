import path from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/lib/index.ts"),
      formats: ["es"],
    },
    rollupOptions: {
      external: [/^ol*/],
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [dts({ include: ["src/lib"] })],
  resolve: {
    alias: {
      src: path.resolve(__dirname, "./src"),
    },
  },
});
