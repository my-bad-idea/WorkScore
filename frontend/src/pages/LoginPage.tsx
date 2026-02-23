import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Alert } from 'antd';
import { useAuth, normalizeUser } from '../stores/auth';
import { authApi } from '../api/client';
import AuthLayout from './auth/AuthLayout';

export default function LoginPage() {
  const { installed, user, loading, setToken, setUser } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  useEffect(() => {
    if (!loading && !installed) navigate('/setup', { replace: true });
    if (user) navigate('/', { replace: true });
  }, [installed, user, loading, navigate]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { username: string; password: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      const data = await authApi.login(values.username, values.password);
      setToken(data.access_token);
      setUser(normalizeUser((data.user ?? {}) as Record<string, unknown>));
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  /** 焦点在卡片区域（非输入框）时按回车也触发表单提交，避免“有时按回车无效” */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const tag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    e.preventDefault();
    form.submit();
  };

  if (loading) return null;

  return (
    <AuthLayout
      type="login"
      title="工作智能评分平台"
      subtitle="输入您的账号密码以登录系统"
      badge="欢迎回来"
    >
      {error && <Alert type="error" message={error} style={{ marginBottom: 20 }} />}
      <div tabIndex={0} onKeyDown={onKeyDown} className="auth-form-wrap">
        <Form form={form} layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
          <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
            <Input placeholder="请输入您的账号" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="请输入您的密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginTop: 30, marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              登录
            </Button>
          </Form.Item>
        </Form>
      </div>
    </AuthLayout>
  );
}
