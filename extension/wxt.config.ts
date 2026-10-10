import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Conversation Coach',
    description: 'Record your camera or meetings, replay, and review your words.',
    version: '0.5.2',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkvXAIDWKprUttd+aM9JlYiD0HYbo+w1LG6mq2fEsnaTl8NgyJL9HPpyZXtSYHOq3fpMCT6Pw56KcGiW2LsDpyOukD/iLVDROPyvGEuQLs6E4R5hAeaWQSlTveXkqb+FHMN+gfjH6E1GMYawhLIMJPe+0OQ8WGH6CbWZ4Cfyviuu1uON6HAUy92+ETXvCwbhhbOHx9tNGgCYafX0J/qgX562ZLmStJ50eo6nbpsUD0KbdCFwYmw24+QDk/z5jQjf+PTPOrBI92Gynoj9HN9wmtOlAo8zEpj1MaUznuruJ2/acQL3OCYF+6Mo0S00U8i8UheRaKZVPCowJdiS1k9HrGQIDAQAB',
    permissions: ['activeTab', 'desktopCapture', 'nativeMessaging', 'notifications', 'storage', 'tabCapture'],
    host_permissions: ['http://127.0.0.1/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
