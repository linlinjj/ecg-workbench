import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';
// Only this checkout's tests; retained extracted acceptance copies are separate projects.
export default mergeConfig(viteConfig, defineConfig({ test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] } }));
