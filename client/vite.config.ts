import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';

export default defineConfig({
  plugins: [react(), basicSsl()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: true, // 允许局域网设备访问（手机同 WiFi 测试）
    port: 5173,
    https: true, // PWA / Service Worker 在非 localhost 需要 HTTPS
    proxy: {
      // 显式走本机，避免系统代理把 localhost 请求拐走
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:3000', ws: true },
      '/avatars': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      // 游戏音效在仓库 public/game，由 Express 提供
      '/game': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: false,
  },
});
