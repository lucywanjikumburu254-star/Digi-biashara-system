import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ke.co.digitalkingdomsolutions.digibiashara',
  appName: 'Digi Biashara',
  webDir: 'www',
  server: {
    // Load the current production system, not an old preview or the obsolete /open route.
    url: 'https://digi-biashara-fresh.vercel.app/login',
    cleartext: false,
    allowNavigation: ['digi-biashara-fresh.vercel.app', '*.vercel.app', '*.supabase.co'],
  },
  android: { allowMixedContent: false },
};

export default config;
