import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Conversation Coach',
    description: 'Record, replay, and review your meeting conversations.',
    version: '0.2.0',
    permissions: ['desktopCapture', 'notifications', 'storage'],
    host_permissions: ['http://127.0.0.1/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
