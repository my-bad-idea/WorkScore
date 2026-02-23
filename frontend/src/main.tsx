import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { AuthProvider } from './stores/auth';
import { ErrorBoundary } from './ErrorBoundary';
import App from './App';
import './index.css';
import './styles/admin.css';

dayjs.locale('zh-cn');

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ConfigProvider locale={zhCN}>
          <App />
        </ConfigProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
