import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.edu.kkhmcollege.ams',
  appName: 'KKHM AMS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#1E3A5F',
    allowMixedContent: false,
    captureInput: true,
  },
};

export default config;
