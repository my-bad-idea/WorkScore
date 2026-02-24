import { useEffect, useState } from 'react';
import { Button, Card, Table, Space, Modal, Form, Input, Select, Switch, message } from 'antd';
import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import MdEditor from '@uiw/react-md-editor';
import { getCommands, getExtraCommands } from '@uiw/react-md-editor/commands-cn';
import { useAuth } from '../../stores/auth';
import { canEditPosition } from '../../utils/permissions';
import { useThemeMode } from '../../theme/ThemeContext';
import { positionsApi, departmentsApi, scoresApi } from '../../api/client';
import './system-pages.css';

type PositionItem = {
  id: number;
  departmentId: number;
  name: string;
  assessmentCriteria: string;
  enabled: boolean;
  departmentName?: string;
};

function PositionsMdEditor({ value, onChange }: { value?: string; onChange?: (v?: string) => void }) {
  const themeMode = useThemeMode();
  return (
    <div data-color-mode={themeMode} className="positions-md-editor-wrap">
      <MdEditor
        value={value ?? ''}
        onChange={onChange}
        commands={getCommands()}
        extraCommands={getExtraCommands()}
        preview="live"
        height={200}
        visibleDragbar={false}
        textareaProps={{ placeholder: '支持 Markdown，描述岗位考核标准…' }}
      />
    </div>
  );
}

function AiCriteriaMdEditor({ value, onChange }: { value?: string; onChange?: (v?: string) => void }) {
  const themeMode = useThemeMode();
  return (
    <div data-color-mode={themeMode} className="positions-md-editor-wrap">
      <MdEditor
        value={value ?? ''}
        onChange={onChange}
        commands={getCommands()}
        extraCommands={getExtraCommands()}
        preview="live"
        height={360}
        visibleDragbar={false}
        textareaProps={{ placeholder: '点击「生成」根据部门与岗位名称生成考核标准…' }}
      />
    </div>
  );
}

export default function PositionsPage() {
  const { user } = useAuth();
  const canAdd = user?.role === 'system_admin' || user?.role === 'department_admin';
  const [list, setList] = useState<PositionItem[]>([]);
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [aiCriteriaModalOpen, setAiCriteriaModalOpen] = useState(false);
  const [aiCriteriaContent, setAiCriteriaContent] = useState('');
  const [aiCriteriaRequirements, setAiCriteriaRequirements] = useState('');
  const [aiCriteriaGenerating, setAiCriteriaGenerating] = useState(false);

  const positionFormCacheKey = user?.id != null ? `workScore.formCache.position.${user.id}` : null;
  const savePositionFormCache = (values: { departmentId?: number; name?: string; assessmentCriteria?: string; enabled?: boolean }) => {
    if (!positionFormCacheKey) return;
    try {
      localStorage.setItem(positionFormCacheKey, JSON.stringify({
        departmentId: values.departmentId,
        name: values.name ?? '',
        assessmentCriteria: values.assessmentCriteria ?? '',
        enabled: values.enabled ?? true,
      }));
    } catch {
      // ignore
    }
  };
  const loadPositionFormCache = (): { departmentId?: number; name: string; assessmentCriteria: string; enabled: boolean } | null => {
    if (!positionFormCacheKey) return null;
    try {
      const raw = localStorage.getItem(positionFormCacheKey);
      if (!raw) return null;
      const data = JSON.parse(raw) as { departmentId?: number; name?: string; assessmentCriteria?: string; enabled?: boolean };
      return {
        departmentId: data.departmentId,
        name: data.name ?? '',
        assessmentCriteria: data.assessmentCriteria ?? '',
        enabled: data.enabled ?? true,
      };
    } catch {
      return null;
    }
  };
  const clearPositionFormCache = () => {
    if (positionFormCacheKey) try { localStorage.removeItem(positionFormCacheKey); } catch { /* ignore */ }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [posData, deptData] = await Promise.all([positionsApi.list(), departmentsApi.list()]);
      setList(posData);
      setDepartments(deptData.map((d) => ({ id: d.id, name: d.name })));
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    const cached = loadPositionFormCache();
    form.setFieldsValue(cached ?? { departmentId: undefined, name: '', assessmentCriteria: '', enabled: true });
    setModalOpen(true);
  };

  const openEdit = (record: PositionItem) => {
    setEditingId(record.id);
    form.setFieldsValue({
      departmentId: record.departmentId,
      name: record.name,
      assessmentCriteria: record.assessmentCriteria,
      enabled: record.enabled,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const criteria = typeof values.assessmentCriteria === 'string' ? values.assessmentCriteria.trim() : '';
    setSubmitting(true);
    try {
      if (editingId != null) {
        await positionsApi.update(editingId, { departmentId: values.departmentId, name: values.name, assessmentCriteria: criteria, enabled: values.enabled });
        message.success('已更新');
      } else {
        await positionsApi.create({ departmentId: values.departmentId, name: values.name, assessmentCriteria: criteria, enabled: values.enabled });
        clearPositionFormCache();
        message.success('已新增');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = (id: number) => {
    Modal.confirm({ title: '确认删除？', onOk: async () => {
      try {
        await positionsApi.remove(id);
        message.success('已删除');
        load();
      } catch (e) {
        message.error(e instanceof Error ? e.message : '删除失败');
      }
    } });
  };

  const openAiCriteriaModal = () => {
    const deptId = form.getFieldValue('departmentId');
    const name = form.getFieldValue('name')?.trim() ?? '';
    if (!deptId || !name) {
      message.warning('请先选择部门并填写岗位名称');
      return;
    }
    setAiCriteriaContent(form.getFieldValue('assessmentCriteria') ?? '');
    setAiCriteriaRequirements('');
    setAiCriteriaModalOpen(true);
  };

  const handleAiGenerate = async () => {
    const deptId = form.getFieldValue('departmentId');
    const name = form.getFieldValue('name')?.trim() ?? '';
    const dept = departments.find((d) => d.id === deptId);
    const departmentName = dept?.name ?? '';
    if (!departmentName || !name) {
      message.warning('请先选择部门并填写岗位名称');
      return;
    }
    setAiCriteriaGenerating(true);
    try {
      const res = await scoresApi.aiGenerateCriteria({
        departmentName,
        positionName: name,
        requirements: aiCriteriaRequirements.trim() || undefined,
      });
      setAiCriteriaContent(res.content ?? '');
      message.success('已生成考核标准');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '生成失败');
    } finally {
      setAiCriteriaGenerating(false);
    }
  };

  const handleAiApply = () => {
    form.setFieldsValue({ assessmentCriteria: aiCriteriaContent });
    setAiCriteriaModalOpen(false);
    message.success('已应用到考核标准');
  };

  return (
    <>
      <Card
        title="岗位管理"
        extra={
          canAdd ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增
            </Button>
          ) : null
        }
      >
        <Table
          loading={loading}
          dataSource={list}
          rowKey="id"
          size="middle"
          columns={[
            { title: '部门', dataIndex: 'departmentName', key: 'departmentName', width: 160, ellipsis: true },
            { title: '岗位名称', dataIndex: 'name', key: 'name', width: 200, ellipsis: true },
            { title: '启用', dataIndex: 'enabled', key: 'enabled', width: 60, align: 'center' as const, render: (v: boolean) => (v ? '是' : '否') },
            {
              title: '操作',
              key: 'action',
              align: 'center',
              width: 120,
              fixed: 'right',
              render: (_, record) => {
                const canEdit = canEditPosition(user ?? null, record);
                return (
                  <Space>
                    <a className={`system-table-action-link ${!canEdit ? 'disabled' : ''}`} onClick={() => canEdit && openEdit(record)}>
                      编辑
                    </a>
                    <a className={`system-table-action-link ${!canEdit ? 'disabled' : ''}`} onClick={() => canEdit && handleRemove(record.id)}>
                      删除
                    </a>
                  </Space>
                );
              },
            },
          ]}
        />
      </Card>
      <Modal
        title={editingId != null ? '编辑岗位' : '新增岗位'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        width={520}
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(_, all) => {
            if (editingId == null) savePositionFormCache(all);
          }}
        >
          <Form.Item name="departmentId" label="部门" rules={[{ required: true }]}>
            <Select placeholder="选择部门" options={departments.map((d) => ({ value: d.id, label: d.name }))} />
          </Form.Item>
          <Form.Item name="name" label="岗位名称" rules={[{ required: true }]}>
            <Input placeholder="岗位名称" />
          </Form.Item>
          <Form.Item
            name="assessmentCriteria"
            label="考核标准"
            rules={[{ required: true, message: '请输入考核标准' }]}
            extra={
              canAdd ? (
                <Button type="link" icon={<ThunderboltOutlined />} onClick={openAiCriteriaModal} style={{ paddingLeft: 0 }}>
                  AI 生成考核标准
                </Button>
              ) : null
            }
          >
            <PositionsMdEditor />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="AI 生成考核标准"
        open={aiCriteriaModalOpen}
        onCancel={() => setAiCriteriaModalOpen(false)}
        width={720}
        footer={[
          <Button key="generate" type="primary" onClick={handleAiGenerate} loading={aiCriteriaGenerating}>
            生成
          </Button>,
          <Button key="apply" onClick={handleAiApply}>
            应用
          </Button>,
          <Button key="close" onClick={() => setAiCriteriaModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <p className="positions-ai-modal-dept-line">
          部门：<strong>{departments.find((d) => d.id === form.getFieldValue('departmentId'))?.name ?? '-'}</strong>
          {' · '}
          岗位：<strong>{form.getFieldValue('name') || '-'}</strong>
        </p>
        <Form layout="vertical" className="positions-ai-modal-form">
          <Form.Item label="生成考核标准要求" extra="选填，可补充希望 AI 重点体现的维度或要求，与部门、岗位信息一并参与生成">
            <Input.TextArea
              rows={3}
              value={aiCriteriaRequirements}
              onChange={(e) => setAiCriteriaRequirements(e.target.value)}
              placeholder="例如：侧重项目交付与客户反馈；或：需包含安全合规、创新建议两项维度"
            />
          </Form.Item>
        </Form>
        <AiCriteriaMdEditor value={aiCriteriaContent} onChange={(v) => setAiCriteriaContent(v ?? '')} />
      </Modal>
    </>
  );
}
