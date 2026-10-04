import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function resolveBuildSha() {
  const fromEnv = (process.env.OPDF_BUILD_SHA || process.env.GITHUB_SHA || "").trim();
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const buildSha = resolveBuildSha();

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "opdf-build-fingerprint",
      transformIndexHtml(html) {
        return html.replace(
          "<head>",
          `<head>\n    <meta name="opdf-build-sha" content="${buildSha}">`,
        );
      },
    },
    react(),
    tailwindcss(),
  ],
  define: {
    __OPDF_BUILD_SHA__: JSON.stringify(buildSha),
  },
  server: {
    port: 5174,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:5175",
        changeOrigin: true,
      }
    }
  },
});
