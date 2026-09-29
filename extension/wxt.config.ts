import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Conversation Coach',
    description: 'Record, replay, and review your Episoden conversations.',
    version: '0.1.0',
    host_permissions: ['http://127.0.0.1/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
