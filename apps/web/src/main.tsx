import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme as antdTheme } from 'antd';
import enUS from 'antd/locale/en_US';
import deDE from 'antd/locale/de_DE';
import 'antd/dist/reset.css';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { App } from './App';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import './i18n/index';
import './index.css';

function ThemedApp() {
  const { theme } = useTheme();
  const { i18n } = useTranslation();
  const antdLocale = i18n.language.startsWith('de') ? deDE : enUS;

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { colorPrimary: '#722ed1', borderRadius: 8 }
      }}
    >
      <App />
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  </React.StrictMode>
);
