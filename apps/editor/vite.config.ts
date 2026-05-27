import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()] as any,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
            if (id.includes('pdfjs-dist')) return 'vendor-pdf';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('pptxgenjs') || id.includes('html-to-docx')) return 'vendor-export';
            if (id.includes('@google/genai') || id.includes('mammoth') || id.includes('officeparser')) return 'vendor-ai-office';
            if (id.includes('lucide-react') || id.includes('motion')) return 'vendor-ui';
            return 'vendor-misc';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      port: 5175,
      strictPort: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
