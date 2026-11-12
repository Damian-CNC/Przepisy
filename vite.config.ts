import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/Przepisy/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        id: '/Przepisy/',
        name: 'Nasze Przepisy',
        short_name: 'Przepisy',
        description:
          'Prywatna książka kucharska z tłumaczeniem AI i trybem gotowania krok po kroku.',
        theme_color: '#f8f5f0',
        background_color: '#f8f5f0',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'pl',
        start_url: '/Przepisy/',
        scope: '/Przepisy/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
        share_target: {
          action: './',
          method: 'GET',
          params: {
            title: 'shared_title',
            text: 'shared_text',
            url: 'shared_url',
          },
        },
      },
    }),
  ],
})
