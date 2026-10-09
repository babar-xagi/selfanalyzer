import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Conversation Coach',
    description: 'Record your camera or meetings, replay, and review your words.',
    version: '0.4.0',
    permissions: ['desktopCapture', 'nativeMessaging', 'notifications', 'storage'],
    host_permissions: ['http://127.0.0.1/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
