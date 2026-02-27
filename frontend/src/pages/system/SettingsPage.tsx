import { useEffect, useState } from 'react';
import { Card, Form, InputNumber, Input, Button, message, Divider, Row, Col, Switch, Slider } from 'antd';
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
  const workPlanRatio = Form.useWatch('work_plan_ratio_percent', form);
  const aiRatio = Form.useWatch('llm_assessment_weight_percent', form);

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
          llm_temperature: data.llm_temperature !== undefined && data.llm_temperature !== '' ? Number(data.llm_temperature) : 0,
          llm_top_p: data.llm_top_p !== undefined && data.llm_top_p !== '' ? Number(data.llm_top_p) : 1,
          llm_top_k: data.llm_top_k !== undefined && data.llm_top_k !== '' ? Number(data.llm_top_k) : 1,
          llm_stream: data.llm_stream === 'true',
          llm_assessment_interval_seconds: data.llm_assessment_interval_seconds ? Number(data.llm_assessment_interval_seconds) : 5,
          llm_assessment_retry_interval_seconds: data.llm_assessment_retry_interval_seconds ? Number(data.llm_assessment_retry_interval_seconds) : 60,
          llm_assessment_weight_percent: data.llm_assessment_weight_percent ? Number(data.llm_assessment_weight_percent) : 80,
          work_plan_ratio_percent: data.work_plan_ratio_percent ? Number(data.work_plan_ratio_percent) : 40,
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
    llm_temperature?: number;
    llm_top_p?: number;
    llm_top_k?: number;
    llm_stream?: boolean;
    llm_assessment_interval_seconds?: number;
    llm_assessment_retry_interval_seconds?: number;
    llm_assessment_weight_percent?: number;
    work_plan_ratio_percent?: number;
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
      if (values.llm_temperature !== undefined) body.llm_temperature = String(Math.min(2, Math.max(0, Number(values.llm_temperature) ?? 0)));
      if (values.llm_top_p !== undefined) body.llm_top_p = String(Math.min(1, Math.max(0, Number(values.llm_top_p) ?? 1)));
      if (values.llm_top_k !== undefined) body.llm_top_k = String(Math.max(1, Math.floor(values.llm_top_k ?? 1)));
      if (values.llm_stream !== undefined) body.llm_stream = values.llm_stream ? 'true' : 'false';
      if (values.llm_assessment_interval_seconds !== undefined)
        body.llm_assessment_interval_seconds = String(Math.max(1, Math.floor(values.llm_assessment_interval_seconds ?? 5)));
      if (values.llm_assessment_retry_interval_seconds !== undefined)
        body.llm_assessment_retry_interval_seconds = String(Math.max(0, Math.floor(values.llm_assessment_retry_interval_seconds ?? 60)));
      if (values.llm_assessment_weight_percent !== undefined)
        body.llm_assessment_weight_percent = String(Math.min(100, Math.max(0, Math.floor(values.llm_assessment_weight_percent ?? 80))));
      if (values.work_plan_ratio_percent !== undefined)
        body.work_plan_ratio_percent = String(Math.min(100, Math.max(0, Math.floor(values.work_plan_ratio_percent ?? 40))));
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
          <Form.Item
            name="llm_temperature"
            label="Temperature"
            extra="生成随机性，0 更确定、2 更随机；考核场景建议 0"
            rules={[{ required: true }, { type: 'number', min: 0, max: 2 }]}
          >
            <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} disabled={!canEdit} />
          </Form.Item>
          <Form.Item
            name="llm_top_p"
            label="Top P"
            extra="核采样参数，0–1；1 表示不启用核采样"
            rules={[{ required: true }, { type: 'number', min: 0, max: 1 }]}
          >
            <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} disabled={!canEdit} />
          </Form.Item>
          <Form.Item
            name="llm_top_k"
            label="Top K"
            extra="采样时保留概率最高的 K 个 token；1 表示仅取最高概率，输出更确定"
            rules={[{ required: true }, { type: 'number', min: 1, max: 100 }]}
          >
            <InputNumber min={1} max={100} step={1} style={{ width: '100%' }} disabled={!canEdit} />
          </Form.Item>
          <Form.Item
            name="llm_stream"
            label="流式输出"
            valuePropName="checked"
            extra="是否以 SSE 流式返回；考核与生成场景建议关闭（false）"
          >
            <Switch disabled={!canEdit} />
          </Form.Item>

          <Divider orientation="left" style={{ marginTop: 24, marginBottom: 16 }}>
            考核配置
          </Divider>
          <div className="settings-assessment-hint">
            <div className="settings-assessment-hint-text">
              总分 = 工作计划得分 × 工作计划占比 + 周报得分 × 周报占比；周报得分内部再按 AI / 人工占比合成。
            </div>
            <Row gutter={24}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="work_plan_ratio_percent"
                  label="工作计划考核占比（%）"
                  extra="与周报考核占比之和为 100%"
                  rules={[{ required: true }, { type: 'number', min: 0, max: 100 }]}
                >
                  <div className="settings-slider-row">
                    <Slider
                      min={0}
                      max={100}
                      tooltip={{ formatter: (v) => `${v}%` }}
                      disabled={!canEdit}
                    />
                    <span className="settings-slider-value">
                      {typeof workPlanRatio === 'number' ? `${workPlanRatio}%` : '--'}
                    </span>
                  </div>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  noStyle
                  shouldUpdate={(prev, curr) => prev?.work_plan_ratio_percent !== curr?.work_plan_ratio_percent}
                >
                  {({ getFieldValue }) => {
                    const wp = getFieldValue('work_plan_ratio_percent');
                    const weekly = typeof wp === 'number' ? 100 - wp : 60;
                    return (
                      <Form.Item label="周报考核占比（%）" extra="只读，= 100% − 工作计划占比">
                        <div className="settings-slider-row">
                          <Slider
                            min={0}
                            max={100}
                            value={weekly}
                            disabled
                            tooltip={{ formatter: (v) => `${v}%` }}
                          />
                          <span className="settings-slider-value">
                            {`${weekly}%`}
                          </span>
                        </div>
                      </Form.Item>
                    );
                  }}
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="llm_assessment_weight_percent"
                  label="周报AI考核占比（%）"
                  extra="周报分数中 AI 评分的权重；与人工占比之和为 100%"
                  rules={[{ required: true }, { type: 'number', min: 0, max: 100 }]}
                >
                  <div className="settings-slider-row">
                    <Slider
                      min={0}
                      max={100}
                      tooltip={{ formatter: (v) => `${v}%` }}
                      disabled={!canEdit}
                    />
                    <span className="settings-slider-value">
                      {typeof aiRatio === 'number' ? `${aiRatio}%` : '--'}
                    </span>
                  </div>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  noStyle
                  shouldUpdate={(prev, curr) => prev?.llm_assessment_weight_percent !== curr?.llm_assessment_weight_percent}
                >
                  {({ getFieldValue }) => {
                    const ai = getFieldValue('llm_assessment_weight_percent');
                    const manual = typeof ai === 'number' ? 100 - ai : 20;
                    return (
                      <Form.Item label="周报人工考核占比（%）" extra="只读，= 100% − 周报AI占比">
                        <div className="settings-slider-row">
                          <Slider
                            min={0}
                            max={100}
                            value={manual}
                            disabled
                            tooltip={{ formatter: (v) => `${v}%` }}
                          />
                          <span className="settings-slider-value">
                            {`${manual}%`}
                          </span>
                        </div>
                      </Form.Item>
                    );
                  }}
                </Form.Item>
              </Col>
            </Row>
          </div>
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
