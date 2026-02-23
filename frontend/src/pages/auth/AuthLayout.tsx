import { ReactNode } from 'react';
import './auth.css';

interface AuthLayoutProps {
  /** 页面类型: login | setup */
  type?: 'login' | 'setup';
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
}

/* ---------- SVG 图标：工作智能评分平台（报告文档 + 星标评分） ---------- */
const LoginIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {/* 报告/文档：日报周报 */}
    <path d="M7 2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
    <polyline points="14 2 14 7 19 7" />
    <line x1="10" y1="12" x2="16" y2="12" />
    <line x1="10" y1="16" x2="14" y2="16" />
    {/* 星标：评分/考核（五角星轮廓） */}
    <path d="M17 10l1.5 4.5 4.5.5-3.5 3 1 4.2L17 19l-2.5-1.8 1-4.2-3.5-3 4.5-.5L17 10z" />
  </svg>
);

const SetupIcon = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export default function AuthLayout({ type = 'login', title, subtitle, badge, children }: AuthLayoutProps) {
  return (
    <div className="auth-page">
      {/* 浮动光球 */}
      <div className="auth-orbs" aria-hidden="true">
        <div className="auth-orb auth-orb--1" />
        <div className="auth-orb auth-orb--2" />
        <div className="auth-orb auth-orb--3" />
      </div>

      <div className="auth-card">
        <div className="auth-card-body">
          <header className="auth-card-header">
            <div className="auth-icon">
              {type === 'setup' ? <SetupIcon /> : <LoginIcon />}
            </div>
            {badge && <div className="auth-badge">{badge}</div>}
            <div className="auth-logo">
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </header>
          {children}
        </div>

        {/* 分隔线 + footer */}
        <div className="auth-divider" />
        <footer className="auth-footer">
          <span>WorkScore &copy; {new Date().getFullYear()}</span>
        </footer>
      </div>
    </div>
  );
}
