import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.huddle.app',
  appName: 'Huddle',
  webDir: 'dist',
  server: {
    // Allows loading local assets while connecting to remote WebRTC/Socket.io signaling
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    // Configure native plugins if needed
  },
};

export default config;
