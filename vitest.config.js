import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { transformSync } from "@babel/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Pre-transform .js files that contain JSX using Babel, before OXC runs
const jsJsxPlugin = {
  name: "js-jsx-transform",
  enforce: "pre",
  transform(code, id) {
    if (!id.match(/\/app\//) || !id.endsWith(".js")) return null;
    if (!code.includes("<") && !code.includes("jsx")) return null;
    try {
      const result = transformSync(code, {
        filename: id,
        presets: [
          ["@babel/preset-react", { runtime: "automatic" }],
          ["@babel/preset-env", { targets: { node: "current" }, modules: false }],
        ],
        sourceType: "module",
      });
      return result ? { code: result.code, map: result.map } : null;
    } catch {
      return null;
    }
  },
};

export default defineConfig({
  plugins: [jsJsxPlugin, react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.js"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
