import { useEffect, useState, useRef } from 'react';
import { Card, Form, Input, Button, message, Divider, Radio, Select, Table, Typography, Alert } from 'antd';
import { useAuth } from '../../stores/auth';
import { canUseAiAssessment } from '../../utils/permissions';
import { departmentsApi, positionsApi, scoresApi, settingsApi } from '../../api/client';
import './system-pages.css';

const STORAGE_KEY_PREFIX = 'ai-test-params-';

type SavedParams = {
  criteriaSource: 'position' | 'manual';
  testDepartmentId?: number;
  testPositionId?: number;
  testCriteria: string;
  testWorkContent: string;
};

function getStorageKey(userId: number): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function loadParams(userId: number): Partial<SavedParams> | null {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedParams;
    if (parsed && typeof parsed.criteriaSource === 'string' && typeof parsed.testCriteria === 'string' && typeof parsed.testWorkContent === 'string') {
      return {
        criteriaSource: parsed.criteriaSource === 'position' ? 'position' : 'manual',
        testDepartmentId: typeof parsed.testDepartmentId === 'number' ? parsed.testDepartmentId : undefined,
        testPositionId: typeof parsed.testPositionId === 'number' ? parsed.testPositionId : undefined,
        testCriteria: String(parsed.testCriteria ?? ''),
        testWorkContent: String(parsed.testWorkContent ?? ''),
      };
    }
  } catch (_) {}
  return null;
}

function saveParams(userId: number, params: SavedParams): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(params));
  } catch (_) {}
}

type AiTestResult = {
  scoreDetails: { item_name: string; score: number; comment: string }[];
  totalScore: number;
  remark: string;
};

export default function AiTestPage() {
  const { user } = useAuth();
  const canRun = canUseAiAssessment(user);
  const [criteriaSource, setCriteriaSource] = useState<'position' | 'manual'>('manual');
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [positions, setPositions] = useState<{ id: number; departmentId: number; name: string; assessmentCriteria: string }[]>([]);
  const [testCriteria, setTestCriteria] = useState('');
  const [testWorkContent, setTestWorkContent] = useState('');
  const [aiTestLoading, setAiTestLoading] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<AiTestResult | null>(null);
  const [testDepartmentId, setTestDepartmentId] = useState<number | undefined>();
  const [testPositionId, setTestPositionId] = useState<number | undefined>();
  const [llmConfig, setLlmConfig] = useState<{ model: string; apiConfigured: boolean } | null>(null);
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    departmentsApi.list().then((list) => setDepartments(list.filter((d) => d.enabled).map((d) => ({ id: d.id, name: d.name })))).catch(() => setDepartments([]));
    positionsApi.list().then((list) => setPositions(list.filter((p) => p.enabled).map((p) => ({ id: p.id, departmentId: p.departmentId, name: p.name, assessmentCriteria: typeof p.assessmentCriteria === 'string' ? p.assessmentCriteria : JSON.stringify(p.assessmentCriteria ?? '') })))).catch(() => setPositions([]));
  }, []);

  useEffect(() => {
    settingsApi.get().then((data) => {
      const apiUrl = (data.llm_api_url ?? '').trim();
      const apiKey = (data.llm_api_key ?? '').trim();
      setLlmConfig({
        model: (data.llm_model ?? 'gpt-3.5-turbo').trim() || 'gpt-3.5-turbo',
        apiConfigured: !!apiUrl && !!apiKey,
      });
    }).catch(() => setLlmConfig({ model: 'gpt-3.5-turbo', apiConfigured: false }));
  }, []);

  // 按账号从本地缓存恢复上次输入的参数
  useEffect(() => {
    if (!user?.id || hasRestoredRef.current) return;
    const saved = loadParams(user.id);
    if (saved) {
      if (saved.criteriaSource != null) setCriteriaSource(saved.criteriaSource);
      if (saved.testDepartmentId !== undefined) setTestDepartmentId(saved.testDepartmentId);
      if (saved.testPositionId !== undefined) setTestPositionId(saved.testPositionId);
      if (saved.testCriteria != null) setTestCriteria(saved.testCriteria);
      if (saved.testWorkContent != null) setTestWorkContent(saved.testWorkContent);
    }
    hasRestoredRef.current = true; // 标记已恢复，后续变更再写入缓存
  }, [user?.id]);

  // 输入变更时写入本地缓存（按账号）
  useEffect(() => {
    if (!user?.id || !hasRestoredRef.current) return;
    saveParams(user.id, {
      criteriaSource,
      testDepartmentId,
      testPositionId,
      testCriteria,
      testWorkContent,
    });
  }, [user?.id, criteriaSource, testDepartmentId, testPositionId, testCriteria, testWorkContent]);

  const positionOptionsByDept = testDepartmentId != null ? positions.filter((p) => p.departmentId === testDepartmentId) : positions;

  const onPositionSelect = (positionId: number | undefined) => {
    setTestPositionId(positionId ?? undefined);
    if (positionId == null) {
      setTestCriteria('');
      return;
    }
    const pos = positions.find((p) => p.id === positionId);
    setTestCriteria(pos?.assessmentCriteria ?? '');
  };

  const runAiTest = async () => {
    const criteria = testCriteria.trim();
    const workContent = testWorkContent.trim();
    if (!criteria) {
      message.warning('请填写或通过选择岗位获取考核标准');
      return;
    }
    if (!workContent) {
      message.warning('请填写周报/日报内容');
      return;
    }
    setAiTestLoading(true);
    setAiTestResult(null);
    try {
      const res = await scoresApi.aiTest({ criteriaMarkdown: criteria, workContent });
      setAiTestResult(res);
      message.success('考核测试完成');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '考核测试失败');
    } finally {
      setAiTestLoading(false);
    }
  };

  return (
    <div>
      <Card
        title="AI考核测试"
        extra={!canRun && <Typography.Text type="secondary">仅系统管理员或部门管理员可执行测试</Typography.Text>}
        style={{ maxWidth: 720 }}
      >
        {llmConfig && (
          <Alert
            type={llmConfig.apiConfigured ? 'info' : 'warning'}
            showIcon
            message={
              llmConfig.apiConfigured
                ? `测试将使用系统设置中的 LLM 配置：模型 ${llmConfig.model}`
                : '请先在【系统设置】中配置 LLM API 地址与 API Key，测试将使用该配置'
            }
            style={{ marginBottom: 16 }}
          />
        )}
        <Form layout="vertical">
          <Form.Item label="考核标准来源">
            <Radio.Group
              value={criteriaSource}
              onChange={(e) => {
                setCriteriaSource(e.target.value);
                if (e.target.value === 'manual') setTestCriteria('');
              }}
              options={[
                { value: 'manual', label: '手工录入' },
                { value: 'position', label: '从岗位获取' },
              ]}
            />
          </Form.Item>
          {criteriaSource === 'position' && (
            <>
              <Form.Item label="部门">
                <Select
                  placeholder="选择部门"
                  allowClear
                  style={{ width: 200 }}
                  value={testDepartmentId}
                  onChange={(v) => {
                    setTestDepartmentId(v ?? undefined);
                    setTestPositionId(undefined);
                    setTestCriteria('');
                  }}
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
              </Form.Item>
              <Form.Item label="岗位">
                <Select
                  placeholder="选择岗位"
                  allowClear
                  style={{ width: 200 }}
                  value={testPositionId}
                  onChange={onPositionSelect}
                  options={positionOptionsByDept.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Form.Item>
            </>
          )}
          <Form.Item label="考核标准" extra="从岗位获取后会填入该岗位的考核标准，也可手工编辑">
            <Input.TextArea
              rows={6}
              value={testCriteria}
              onChange={(e) => setTestCriteria(e.target.value)}
              placeholder="Markdown 或 JSON 格式的考核标准"
            />
          </Form.Item>
          <Form.Item label="周报/日报内容">
            <Input.TextArea
              rows={8}
              value={testWorkContent}
              onChange={(e) => setTestWorkContent(e.target.value)}
              placeholder="粘贴或输入待考核的工作记录内容"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={runAiTest} loading={aiTestLoading} disabled={!canRun}>
              测试
            </Button>
          </Form.Item>
        </Form>
        {aiTestResult && (
          <div className="ai-test-result-wrap">
            <Divider orientation="left">评分结果</Divider>
            <Typography.Paragraph strong>综合得分：{aiTestResult.totalScore.toFixed(1)} 分</Typography.Paragraph>
            <Typography.Paragraph strong>评语：</Typography.Paragraph>
            <Typography.Paragraph>{aiTestResult.remark}</Typography.Paragraph>
            <Table
              size="small"
              dataSource={aiTestResult.scoreDetails}
              rowKey="item_name"
              columns={[
                { title: '考核项', dataIndex: 'item_name', key: 'item_name', width: 140, ellipsis: true },
                { title: '分数', dataIndex: 'score', key: 'score', width: 80, render: (v: number) => v.toFixed(1) },
                { title: '评语', dataIndex: 'comment', key: 'comment', ellipsis: true },
              ]}
              pagination={false}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
