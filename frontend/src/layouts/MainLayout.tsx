import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Layout, Menu, Typography, Space, Avatar, Dropdown, App } from 'antd';
import {
  HomeOutlined,
  FileTextOutlined,
  TrophyOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  KeyOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { useAuth } from '../stores/auth';
import { canUseAiAssessment, canAccessSystemConfig } from '../utils/permissions';
import type { ThemeMode, ThemePreference } from '../theme';
import './MainLayout.css';

const { Header, Content, Footer } = Layout;

const allMenuItems = [
  { key: '/', icon: <HomeOutlined />, label: '首页' },
  { key: '/work-records', icon: <FileTextOutlined />, label: '工作记录' },
  { key: '/assessments', icon: <TrophyOutlined />, label: '考核排名' },
  { key: '/score-queue', icon: <UnorderedListOutlined />, label: '智能考核队列' },
  { key: '/system', icon: <SettingOutlined />, label: '系统配置' },
];

/* 太阳 / 月亮 SVG 图标 */
const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const SystemIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const THEME_OPTIONS: { key: ThemePreference; label: string; icon: 'sun' | 'moon' | 'system' }[] = [
  { key: 'light', label: '浅色', icon: 'sun' },
  { key: 'dark', label: '深色', icon: 'moon' },
  { key: 'system', label: '跟随系统', icon: 'system' },
];

export default function MainLayout({
  themePreference,
  onThemeChange,
  resolvedTheme,
}: {
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  resolvedTheme: ThemeMode;
}) {
  const { user, logout } = useAuth();
  const { modal } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const selectedKey =
    location.pathname === '/'
      ? '/'
      : location.pathname.split('/').slice(0, 2).join('/') || '/';

  const menuItems = allMenuItems.filter((item) => {
    if (item.key === '/score-queue') return canUseAiAssessment(user);
    if (item.key === '/system') return canAccessSystemConfig(user);
    return true;
  });

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        {/* Logo */}
        <div className="app-header-logo" onClick={() => navigate('/')}>
          <div className="app-header-logo-icon">W</div>
          <Typography.Text strong className="app-header-logo-text">
            WorkScore
          </Typography.Text>
        </div>

        {/* 导航 */}
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={menuItems}
          className="app-header-menu"
          onClick={({ key }) => navigate(key)}
        />

        {/* 右侧操作区 */}
        <Space size={12} className="app-header-actions">
          {/* 主题选择下拉 */}
          <span className="theme-dropdown-wrap">
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                selectedKeys: [themePreference],
                items: THEME_OPTIONS.map((opt) => ({
                  key: opt.key,
                  label: opt.label,
                  icon: opt.icon === 'sun' ? <SunIcon /> : opt.icon === 'moon' ? <MoonIcon /> : <SystemIcon />,
                  onClick: () => onThemeChange(opt.key),
                })),
              }}
            >
              <button
                className="theme-toggle"
                type="button"
                title="主题"
                aria-label="选择主题"
              >
                <span className={`theme-toggle-icon ${resolvedTheme === 'dark' ? 'theme-toggle-moon' : 'theme-toggle-sun'}`}>
                  {resolvedTheme === 'dark' ? <MoonIcon /> : <SunIcon />}
                </span>
              </button>
            </Dropdown>
          </span>

          {/* 用户下拉菜单 */}
          <Dropdown
            menu={{
              items: [
                {
                  key: 'profile',
                  icon: <IdcardOutlined />,
                  label: '个人信息',
                  onClick: () => navigate('/profile'),
                },
                {
                  key: 'password',
                  icon: <KeyOutlined />,
                  label: '修改密码',
                  onClick: () => navigate('/change-password'),
                },
                { type: 'divider' },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  danger: true,
                  onClick: () => {
                    modal.confirm({
                      title: '确认退出',
                      content: '确定要退出登录吗？',
                      okText: '确定',
                      cancelText: '取消',
                      onOk: logout,
                    });
                  },
                },
              ],
            }}
            placement="bottomRight"
            trigger={['click']}
          >
            <Space className="app-header-user" size={8}>
              <Avatar
                size={32}
                icon={<UserOutlined />}
                className="app-header-avatar"
              />
              <span className="app-header-username">{user.realName}</span>
            </Space>
          </Dropdown>
        </Space>
      </Header>

      <Content className="app-content">
        <Outlet />
      </Content>

      <Footer className="app-footer">
        <span>WorkScore &copy; {new Date().getFullYear()} &mdash; 工作智能评分平台</span>
      </Footer>
    </Layout>
  );
}
