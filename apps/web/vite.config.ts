import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localRuntimeAssets } from './runtime-assets.mjs';

export default defineConfig({
  plugins: [react(), localRuntimeAssets()],
  // Only reviewed runtime images are emitted/served; reference boards stay in the workspace.
  publicDir: false,
});
