import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Alert, Progress } from 'antd';
import { useAuth, normalizeUser } from '../stores/auth';
import { setupApi, authApi } from '../api/client';
import AuthLayout from './auth/AuthLayout';

/** 密码强度：0 弱 1 中 2 强 */
function getPasswordStrength(password: string): number {
  if (!password) return 0;
  let s = 0;
  if (password.length >= 8) s++;
  if (/[a-zA-Z]/.test(password) && /\d/.test(password)) s++;
  if (/[a-zA-Z]/.test(password) && /\d/.test(password) && password.length >= 12) s++;
  return Math.min(s, 2);
}

const strengthLabels = ['弱', '中', '强'];
const strengthColors = ['#ff4d4f', '#faad14', '#52c41a'];

export default function SetupPage() {
  const { installed, loading, checkSetup, setToken, setUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && installed) navigate('/login', { replace: true });
  }, [installed, loading, navigate]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const onFinish = async (values: { username: string; password: string; realName: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      await setupApi.init(values);
      await checkSetup();
      const data = await authApi.login(values.username, values.password);
      setToken(data.access_token);
      setUser(normalizeUser((data.user ?? {}) as Record<string, unknown>));
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '安装失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <AuthLayout
      type="setup"
      title="系统初始化"
      subtitle="创建管理员账号以完成平台安装"
      badge="首次安装"
    >
      {error && <Alert type="error" message={error} style={{ marginBottom: 20 }} />}
      <Form layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
        <Form.Item name="username" label="管理员账号" rules={[{ required: true, message: '请输入账号' }]}>
          <Input placeholder="设置管理员登录账号" autoComplete="username" />
        </Form.Item>
        <Form.Item
          name="password"
          label="登录密码"
          rules={[
            { required: true, message: '请输入密码' },
            { min: 8, message: '密码至少 8 位' },
            {
              pattern: /[a-zA-Z]/,
              message: '密码须包含至少一个英文字母',
            },
            {
              pattern: /\d/,
              message: '密码须包含至少一个数字',
            },
          ]}
        >
          <Input.Password
            placeholder="至少 8 位，含字母和数字"
            autoComplete="new-password"
            onChange={(e) => setPasswordStrength(getPasswordStrength(e.target.value))}
          />
        </Form.Item>
        {passwordStrength >= 0 && (
          <Form.Item label=" " colon={false} className="auth-password-strength">
            <Progress
              percent={passwordStrength === 0 ? 0 : passwordStrength === 1 ? 50 : 100}
              showInfo={false}
              strokeColor={strengthColors[passwordStrength]}
              size="small"
            />
            <span className="auth-password-strength-label">
              强度：{strengthLabels[passwordStrength]}
            </span>
          </Form.Item>
        )}
        <Form.Item
          name="confirmPassword"
          label="确认密码"
          dependencies={['password']}
          rules={[
            { required: true, message: '请再次输入密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password placeholder="再次输入登录密码" autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="realName" label="真实姓名" rules={[{ required: true, message: '请输入姓名' }]}>
          <Input placeholder="输入管理员姓名" autoComplete="name" />
        </Form.Item>
        <Form.Item style={{ marginTop: 30, marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            完成安装
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  );
}
