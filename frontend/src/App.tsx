import { useState, useMemo, useEffect } from 'react';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getStoredTheme, setStoredTheme, getThemeConfig, getSystemTheme, type ThemePreference, type ThemeMode } from './theme';
import { ThemeProvider } from './theme/ThemeContext';
import { useAuth } from './stores/auth';
import MainLayout from './layouts/MainLayout';
import SetupPage from './pages/SetupPage';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import WorkRecordsPage from './pages/WorkRecordsPage';
import WorkRecordDetailPage from './pages/WorkRecordDetailPage';
import AssessmentsPage from './pages/AssessmentsPage';
import WorkPlansPage from './pages/WorkPlansPage';
import ScoreQueuePage from './pages/ScoreQueuePage';
import ProfilePage from './pages/ProfilePage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import SystemLayout from './layouts/SystemLayout';
import RequirePermission from './components/RequirePermission';
import { canUseAiAssessment, canManageSystemSettings, canAccessSystemConfig } from './utils/permissions';
import DepartmentsPage from './pages/system/DepartmentsPage';
import PositionsPage from './pages/system/PositionsPage';
import UsersPage from './pages/system/UsersPage';
import SettingsPage from './pages/system/SettingsPage';
import AiTestPage from './pages/system/AiTestPage';

function AppRoutes() {
  const { loading: authLoading } = useAuth();
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(getSystemTheme);

  const resolvedTheme = useMemo<ThemeMode>(
    () => (themePreference === 'system' ? systemTheme : themePreference),
    [themePreference, systemTheme]
  );
  const themeConfig = useMemo(() => getThemeConfig(resolvedTheme), [resolvedTheme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handle = () => setSystemTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', handle);
    return () => media.removeEventListener('change', handle);
  }, []);

  const setTheme = (next: ThemePreference) => {
    setStoredTheme(next);
    setThemePreference(next);
    const resolved = next === 'system' ? systemTheme : next;
    document.documentElement.setAttribute('data-theme', resolved);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  if (authLoading) return <div className="app-loading">加载中...</div>;

  return (
    <ThemeProvider value={resolvedTheme}>
      <ConfigProvider locale={zhCN} theme={themeConfig}>
        <AntApp>
          <BrowserRouter>
            <Routes>
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<MainLayout themePreference={themePreference} onThemeChange={setTheme} resolvedTheme={resolvedTheme} />}>
              <Route index element={<HomePage />} />
              <Route path="work-records" element={<WorkRecordsPage />} />
            <Route path="work-records/:id" element={<WorkRecordDetailPage />} />
            <Route path="work-plans" element={<WorkPlansPage />} />
            <Route path="assessments" element={<AssessmentsPage />} />
              <Route path="score-queue" element={<RequirePermission check={canUseAiAssessment} redirectTo="/"><ScoreQueuePage /></RequirePermission>} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="change-password" element={<ChangePasswordPage />} />
            <Route path="system" element={<RequirePermission check={canAccessSystemConfig} redirectTo="/"><SystemLayout /></RequirePermission>}>
              <Route index element={<Navigate to="departments" replace />} />
              <Route path="departments" element={<DepartmentsPage />} />
              <Route path="positions" element={<PositionsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="ai-test" element={<RequirePermission check={canUseAiAssessment} redirectTo="/system/departments"><AiTestPage /></RequirePermission>} />
              <Route path="settings" element={<RequirePermission check={canManageSystemSettings} redirectTo="/system/departments"><SettingsPage /></RequirePermission>} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return <AppRoutes />;
}
