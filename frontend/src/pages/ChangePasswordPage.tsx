import { useState } from 'react';
import { Card, Form, Input, Button, message } from 'antd';
import { useAuth } from '../stores/auth';
import { authApi } from '../api/client';
import { passwordStrengthRule } from '../utils/password';

export default function ChangePasswordPage() {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  const onFinish = async (values: { oldPassword: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的新密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.changePassword(values.oldPassword, values.newPassword);
      message.success('密码修改成功');
      form.resetFields();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '修改失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div>
      <Card title="修改密码">
        <Form
          form={form}
          layout="vertical"
          style={{ maxWidth: 400 }}
          onFinish={onFinish}
        >
          <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true, message: '请输入新密码' }, passwordStrengthRule()]}
          >
            <Input.Password placeholder="至少 8 位，含大小写字母、数字、特殊字符" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: '请再次输入新密码' }]}>
            <Input.Password placeholder="请再次输入新密码" autoComplete="new-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting}>
              确认修改
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
