import { defineConfig } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** office-addin-dev-certs 生成的受信任 localhost 证书（Word 加载项必须 HTTPS） */
export function devCerts(): { key: Buffer; cert: Buffer } | undefined {
  const dir = join(homedir(), '.office-addin-dev-certs');
  const key = join(dir, 'localhost.key');
  const cert = join(dir, 'localhost.crt');
  return existsSync(key) && existsSync(cert) ? { key: readFileSync(key), cert: readFileSync(cert) } : undefined;
}

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  define: {
    __WPS_ONLY__: 'false',
    __EDITOR_URL__: JSON.stringify('../index.html'),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 3000,
    strictPort: true,
    https: devCerts(),
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        taskpane: resolve(__dirname, 'office/taskpane.html'),
        wps: resolve(__dirname, 'wps/index.html'),
      },
    },
  },
});
