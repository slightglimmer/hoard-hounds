import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Adds a Content-Security-Policy to the built admin and quote pages: scripts only from this
// site, and network requests only to this site and the Supabase project.
// (Build only: the dev server injects its own scripts for hot reloading.)
function adminCsp(env) {
  const supabase = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : '';
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // Inquiry photos are shown through short-lived signed links from Supabase Storage.
    `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ''}`,
    `connect-src 'self'${supabase ? ` ${supabase} ${supabase.replace(/^http/, 'ws')}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'admin-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.path.startsWith('/admin/') && !ctx.path.startsWith('/quote/')) return html;
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
      },
    },
  };
}

export default defineConfig(({ isSsrBuild, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), tailwindcss(), adminCsp(env)],
    build: isSsrBuild
      ? {}
      : {
          rollupOptions: {
            input: {
              main: resolve(import.meta.dirname, 'index.html'),
              privacy: resolve(import.meta.dirname, 'privacy.html'),
              admin: resolve(import.meta.dirname, 'admin/index.html'),
              quote: resolve(import.meta.dirname, 'quote/index.html'),
            },
          },
        },
  };
});
