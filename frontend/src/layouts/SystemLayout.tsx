import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Menu } from 'antd';
import { TeamOutlined, IdcardOutlined, UserOutlined, ExperimentOutlined, SettingOutlined } from '@ant-design/icons';
import { useAuth } from '../stores/auth';
import { canUseAiAssessment, canManageSystemSettings } from '../utils/permissions';
import './SystemLayout.css';

const allItems = [
  { key: '/system/departments', icon: <TeamOutlined />, label: '部门管理' },
  { key: '/system/positions', icon: <IdcardOutlined />, label: '岗位管理' },
  { key: '/system/users', icon: <UserOutlined />, label: '人员管理' },
  { key: '/system/ai-test', icon: <ExperimentOutlined />, label: 'AI考核测试' },
  { key: '/system/settings', icon: <SettingOutlined />, label: '系统设置' },
];

export default function SystemLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace />;

  const items = allItems.filter((item) => {
    if (item.key === '/system/ai-test') return canUseAiAssessment(user);
    if (item.key === '/system/settings') return canManageSystemSettings(user);
    return true;
  });

  return (
    <div className="system-layout">
      <aside className="system-sidebar">
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          className="system-menu"
          onClick={({ key }) => navigate(key)}
        />
      </aside>
      <main className="system-main">
        <Outlet />
      </main>
    </div>
  );
}
