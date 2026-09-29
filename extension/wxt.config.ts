import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Conversation Coach',
    description: 'Practice sessions and, later, personalized speaking feedback.',
    version: '0.1.0',
    host_permissions: ['http://127.0.0.1/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
