import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub project sites are hosted below /<repository>/ rather than at /.
  // The workflow supplies this value; local development continues to use /.
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    port: 3000,
  },
});
