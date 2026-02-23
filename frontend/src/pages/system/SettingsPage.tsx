import { useEffect, useState } from 'react';
import { Card, Form, InputNumber, Input, Button, message, Divider } from 'antd';
import { useAuth } from '../../stores/auth';
import { canManageSystemSettings } from '../../utils/permissions';
import { settingsApi } from '../../api/client';
import { passwordStrengthRule } from '../../utils/password';

export default function SettingsPage() {
  const { user } = useAuth();
  const canEdit = canManageSystemSettings(user);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await settingsApi.get();
        form.setFieldsValue({
          token_expire_hours: data.token_expire_hours ? Number(data.token_expire_hours) : 168,
          default_user_password: data.default_user_password ?? 'Aa.123456',
          llm_api_url: data.llm_api_url ?? '',
          llm_api_key: data.llm_api_key ?? '',
          llm_model: data.llm_model ?? 'gpt-3.5-turbo',
          llm_assessment_interval_seconds: data.llm_assessment_interval_seconds ? Number(data.llm_assessment_interval_seconds) : 5,
          llm_assessment_retry_interval_seconds: data.llm_assessment_retry_interval_seconds ? Number(data.llm_assessment_retry_interval_seconds) : 60,
          llm_assessment_weight_percent: data.llm_assessment_weight_percent ? Number(data.llm_assessment_weight_percent) : 80,
        });
      } catch (e) {
        message.error(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [form]);

  const onFinish = async (values: {
    token_expire_hours: number;
    default_user_password?: string;
    llm_api_url?: string;
    llm_api_key?: string;
    llm_model?: string;
    llm_assessment_interval_seconds?: number;
    llm_assessment_retry_interval_seconds?: number;
    llm_assessment_weight_percent?: number;
  }) => {
    if (!canEdit) {
      message.error('无权限');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        token_expire_hours: String(values.token_expire_hours),
      };
      if (values.default_user_password !== undefined && values.default_user_password.trim() !== '')
        body.default_user_password = values.default_user_password.trim();
      if (values.llm_api_url !== undefined) body.llm_api_url = values.llm_api_url.trim();
      if (values.llm_api_key !== undefined && String(values.llm_api_key).trim() !== '')
        body.llm_api_key = values.llm_api_key;
      if (values.llm_model !== undefined) body.llm_model = (values.llm_model || 'gpt-3.5-turbo').trim();
      if (values.llm_assessment_interval_seconds !== undefined)
        body.llm_assessment_interval_seconds = String(Math.max(1, Math.floor(values.llm_assessment_interval_seconds ?? 5)));
      if (values.llm_assessment_retry_interval_seconds !== undefined)
        body.llm_assessment_retry_interval_seconds = String(Math.max(0, Math.floor(values.llm_assessment_retry_interval_seconds ?? 60)));
      if (values.llm_assessment_weight_percent !== undefined)
        body.llm_assessment_weight_percent = String(Math.min(100, Math.max(0, Math.floor(values.llm_assessment_weight_percent ?? 80))));
      await settingsApi.update(body);
      message.success('已保存');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card title="系统设置" loading={loading}>
        <Form
          form={form}
          layout="vertical"
          style={{ maxWidth: 560 }}
          onFinish={onFinish}
        >
          <Form.Item
            name="token_expire_hours"
            label="登录令牌过期时间（小时）"
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={8760} style={{ width: '100%' }} disabled={!canEdit} />
          </Form.Item>
          <Form.Item
            name="default_user_password"
            label="默认人员密码"
            extra="新增人员时若不填写密码，将使用此默认密码；需符合密码强度（至少 8 位，含大小写字母、数字、特殊字符）"
            rules={[{ required: true, message: '请填写默认人员密码' }, passwordStrengthRule()]}
          >
            <Input.Password
              placeholder="Aa.123456"
              disabled={!canEdit}
              autoComplete="off"
            />
          </Form.Item>

          <Divider orientation="left" style={{ marginTop: 24, marginBottom: 16 }}>
            LLM 大模型配置
          </Divider>
          <Form.Item
            name="llm_api_url"
            label="API 地址"
            extra="兼容 OpenAI 格式的聊天接口，例如阿里云百炼 qwen：https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
          >
            <Input
              placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
              disabled={!canEdit}
              allowClear
            />
          </Form.Item>
          <Form.Item
            name="llm_api_key"
            label="API Key"
            extra="用于调用大模型接口的密钥；不修改请留空（留空提交不会清空已保存的 Key）"
          >
            <Input.Password
              placeholder="已配置则不显示，输入新值可覆盖"
              disabled={!canEdit}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item
            name="llm_model"
            label="模型名称"
            extra="例如 gpt-3.5-turbo、qwen-turbo、qwen-plus 等"
          >
            <Input placeholder="qwen-turbo" disabled={!canEdit} allowClear />
          </Form.Item>

          <Divider orientation="left" style={{ marginTop: 24, marginBottom: 16 }}>
            考核配置
          </Divider>
          <Form.Item
            name="llm_assessment_interval_seconds"
            label="考核执行间隔（秒）"
            extra="轮询考核队列的间隔，每隔多少秒尝试处理下一条待考核记录；修改后需重启后端生效"
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={3600} style={{ width: '100%' }} disabled={!canEdit} />
          </Form.Item>
          <Form.Item
            name="llm_assessment_retry_interval_seconds"
            label="考核失败重新执行间隔（秒）"
            extra="考核任务失败后，间隔多少秒自动重新加入队列执行"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={86400} style={{ width: '100%' }} disabled={!canEdit} />
          </Form.Item>
          <Form.Item
            name="llm_assessment_weight_percent"
            label="AI考核占比（%）"
            extra="排名与总成绩中，当该条记录同时存在 AI 与人工评分时：AI 得分按此权重、人工得分占其余比例；仅一种评分时取该分数。默认 80"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} disabled={!canEdit} />
          </Form.Item>

          {canEdit && (
            <Form.Item style={{ marginTop: 8 }}>
              <Button type="primary" htmlType="submit" loading={submitting}>
                保存
              </Button>
            </Form.Item>
          )}
        </Form>
      </Card>
    </>
  );
}
