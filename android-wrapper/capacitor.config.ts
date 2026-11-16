import type { CapacitorConfig } from '@capacitor/cli';

const websiteUrl =
  process.env.CAPACITOR_SERVER_URL || 'https://digi-biashara-fresh-git-feature-dara-446882-francis9271057-3716.vercel.app';
const appStartUrl = new URL('/open', websiteUrl).toString();

const config: CapacitorConfig = {
  appId: 'com.digibiashara.app',
  appName: 'Digi Biashara',
  webDir: 'www',
  server: {
    url: appStartUrl,
    cleartext: false,
    allowNavigation: ['digi-biashara-fresh.vercel.app', 'digi-biashara-fresh-git-feature-dara-446882-francis9271057-3716.vercel.app'],
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
