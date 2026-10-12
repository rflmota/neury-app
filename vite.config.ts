import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

const commit = (process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD').toString()).slice(0, 7);

export default defineConfig({
  base: './',
  define: { __COMMIT__: JSON.stringify(commit) },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*'],
      manifest: {
        name: 'Neury Logger',
        short_name: 'Neury',
        description: 'Prepare, start and export the Neury data logger.',
        display: 'standalone',
        background_color: '#f8f8f6',
        theme_color: '#2a6f97',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
