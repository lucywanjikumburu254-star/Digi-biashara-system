import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl =
  process.env.CAPACITOR_SERVER_URL || 'https://digi-biashara-fresh.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.digibiashara.app',
  appName: 'Digi Biashara',
  webDir: 'www',
  server: {
    url: serverUrl,
    cleartext: false,
    allowNavigation: ['digi-biashara-fresh.vercel.app'],
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
