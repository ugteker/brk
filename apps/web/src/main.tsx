import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import enUS from 'antd/locale/en_US';
import deDE from 'antd/locale/de_DE';
import 'antd/dist/reset.css';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { App as MaydozApp } from './App';
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
        token: {
          colorPrimary: '#722ed1',
          borderRadius: 8,
          ...(theme === 'dark' ? {
            // Align Ant Design dark surfaces with our CSS variable palette
            colorBgBase:         'hsl(225, 28%, 8%)',
            colorBgContainer:    'hsl(225, 24%, 12%)',
            colorBgElevated:     'hsl(225, 22%, 16%)',
            colorBgLayout:       'hsl(225, 28%, 8%)',
            colorBorder:         'hsl(225, 18%, 24%)',
            colorBorderSecondary:'hsl(225, 18%, 22%)',
            colorText:           'hsl(220, 18%, 90%)',
            colorTextSecondary:  'hsl(220, 14%, 60%)',
            colorTextTertiary:   'hsl(220, 12%, 45%)',
          } : {})
        }
      }}
    >
      <AntdApp>
        <MaydozApp />
      </AntdApp>
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
