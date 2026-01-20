import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import '@vscode/codicons/dist/codicon.css';
import '@mdi/font/css/materialdesignicons.min.css';
import 'virtual:svg-icons-register';

declare global {
  interface Window {
    acquireVsCodeApi?: <T = unknown>() => {
      postMessage(data: T): void;
      getState(): any;
      setState(data: any): void;
    };
    CLAUDIX_BOOTSTRAP?: {
      host?: 'sidebar' | 'editor';
      page?: string;
    };
  }
}

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global Error:', event.error);
  const app = document.getElementById('app');
  if (app && app.innerHTML === '') {
    app.innerHTML = `<div style="padding: 20px; color: var(--vscode-errorForeground);">
      <h3>Runtime Error</h3>
      <pre>${event.message}\n${event.filename}:${event.lineno}</pre>
    </div>`;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Rejection:', event.reason);
});

try {
  const pinia = createPinia();
  const app = createApp(App);

  app.config.errorHandler = (err, instance, info) => {
    console.error('Vue Error:', err, info);
  };

  app.use(pinia);
  app.mount('#app');
} catch (error) {
  console.error('Mount Error:', error);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `<div style="padding: 20px; color: var(--vscode-errorForeground);">
      <h3>Initialization Error</h3>
      <pre>${String(error)}</pre>
    </div>`;
  }
}
