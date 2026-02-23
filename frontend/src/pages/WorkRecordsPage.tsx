import { useEffect, useRef, useState } from 'react';
import { Button, Card, Table, Space, Modal, Form, DatePicker, message, Select, Radio } from 'antd';
import type { Dayjs } from 'dayjs';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import MdEditor from '@uiw/react-md-editor';
import { getCommands, getExtraCommands } from '@uiw/react-md-editor/commands-cn';
import { useAuth } from '../stores/auth';
import { useThemeMode } from '../theme/ThemeContext';
import { workRecordsApi, usersApi, departmentsApi, positionsApi } from '../api/client';
import './WorkRecordsPage.css';

function ContentMdEditor({ value, onChange }: { value?: string; onChange?: (v?: string) => void }) {
  const themeMode = useThemeMode();
  return (
    <div data-color-mode={themeMode} className="work-records-md-editor-wrap">
      <MdEditor
        value={value ?? ''}
        onChange={onChange}
        commands={getCommands()}
        extraCommands={getExtraCommands()}
        preview="live"
        height={320}
        visibleDragbar={false}
        textareaProps={{ placeholder: '支持 Markdown，可实时预览...' }}
      />
    </div>
  );
}

type RecordItem = {
  id: number;
  type: string;
  recordDate: string;
  content: string;
  recorderId: number;
  recorderName: string;
  recorderDepartmentName?: string;
  recorderPositionName?: string;
  totalScore?: number;
  createdAt: string;
  updatedAt: string;
};

type UserOption = { id: number; realName: string };
type DepartmentOption = { id: number; name: string };
type PositionOption = { id: number; departmentId: number; name: string };

export default function WorkRecordsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<RecordItem[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([]);
  const [positionOptionsAll, setPositionOptionsAll] = useState<PositionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [filterRecorderId, setFilterRecorderId] = useState<number | undefined>();
  const [filterDepartmentId, setFilterDepartmentId] = useState<number | undefined>();
  const [filterPositionId, setFilterPositionId] = useState<number | undefined>();
  const initialDeptSetRef = useRef(false);

  const positionOptionsByDept =
    filterDepartmentId != null
      ? positionOptionsAll.filter((p) => p.departmentId === filterDepartmentId)
      : positionOptionsAll;

  const workRecordFormCacheKey = user?.id != null ? `workScore.formCache.workRecord.${user.id}` : null;
  const saveWorkRecordFormCache = (values: { type?: string; recordDate?: Dayjs; content?: string }) => {
    if (!workRecordFormCacheKey) return;
    try {
      const recordDate = values.recordDate ? dayjs(values.recordDate).format('YYYY-MM-DD') : undefined;
      localStorage.setItem(workRecordFormCacheKey, JSON.stringify({ type: values.type, recordDate, content: values.content ?? '' }));
    } catch {
      // ignore
    }
  };
  const loadWorkRecordFormCache = (): { type: string; recordDate: Dayjs; content: string } | null => {
    if (!workRecordFormCacheKey) return null;
    try {
      const raw = localStorage.getItem(workRecordFormCacheKey);
      if (!raw) return null;
      const data = JSON.parse(raw) as { type?: string; recordDate?: string; content?: string };
      const recordDate = data.recordDate ? dayjs(data.recordDate) : dayjs();
      return { type: data.type ?? 'weekly', recordDate, content: data.content ?? '' };
    } catch {
      return null;
    }
  };
  const clearWorkRecordFormCache = () => {
    if (workRecordFormCacheKey) try { localStorage.removeItem(workRecordFormCacheKey); } catch { /* ignore */ }
  };

  const loadUsers = async () => {
    try {
      const data = await usersApi.list();
      setUserOptions(data.filter((u) => u.enabled).map((u) => ({ id: u.id, realName: u.realName || u.username })));
    } catch {
      setUserOptions([]);
    }
  };

  const loadDepartmentsAndPositions = async () => {
    try {
      const [depts, positions] = await Promise.all([departmentsApi.list(), positionsApi.list()]);
      setDepartmentOptions(depts.filter((d) => d.enabled).map((d) => ({ id: d.id, name: d.name })));
      setPositionOptionsAll(positions.filter((p) => p.enabled).map((p) => ({ id: p.id, departmentId: p.departmentId, name: p.name })));
    } catch {
      setDepartmentOptions([]);
      setPositionOptionsAll([]);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params: { type?: string; recordDateStart?: string; recordDateEnd?: string; recorderId?: string; departmentId?: string; positionId?: string } = {};
      if (filterType) params.type = filterType;
      if (filterDateRange?.[0]) params.recordDateStart = filterDateRange[0].format('YYYY-MM-DD');
      if (filterDateRange?.[1]) params.recordDateEnd = filterDateRange[1].format('YYYY-MM-DD');
      if (filterRecorderId != null) params.recorderId = String(filterRecorderId);
      if (filterDepartmentId != null) params.departmentId = String(filterDepartmentId);
      if (filterPositionId != null) params.positionId = String(filterPositionId);
      const data = await workRecordsApi.list(params);
      setList(data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadDepartmentsAndPositions();
  }, []);

  // 第一次打开时部门筛选默认选中登录人所属部门
  useEffect(() => {
    if (initialDeptSetRef.current || !user?.departmentId || departmentOptions.length === 0) return;
    const hasDept = departmentOptions.some((d) => d.id === user.departmentId);
    if (hasDept) {
      setFilterDepartmentId(user.departmentId);
      initialDeptSetRef.current = true;
    }
  }, [user?.departmentId, departmentOptions]);

  useEffect(() => {
    load();
  }, [filterType, filterDateRange, filterRecorderId, filterDepartmentId, filterPositionId, user?.id]);

  const onFilterDepartmentChange = (id: number | undefined) => {
    setFilterDepartmentId(id);
    setFilterPositionId(undefined);
  };

  const openCreate = () => {
    setEditingId(null);
    const cached = loadWorkRecordFormCache();
    form.setFieldsValue(cached ?? { type: 'weekly', recordDate: dayjs(), content: '' });
    setModalOpen(true);
  };

  const openEdit = (record: RecordItem) => {
    setEditingId(record.id);
    form.setFieldsValue({
      type: record.type,
      recordDate: dayjs(record.recordDate),
      content: record.content ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const recordDate = dayjs(values.recordDate).format('YYYY-MM-DD');
    setSubmitting(true);
    try {
      if (editingId != null) {
        await workRecordsApi.update(editingId, { type: values.type, recordDate, content: values.content ?? '' });
        message.success('已更新');
      } else {
        await workRecordsApi.create({ type: values.type, recordDate, content: values.content ?? '' });
        clearWorkRecordFormCache();
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

  const handleRemove = (record: RecordItem) => {
    if (record.recorderId !== user?.id) return;
    Modal.confirm({
      title: '确认删除？',
      onOk: async () => {
        try {
          await workRecordsApi.remove(record.id);
          message.success('已删除');
          load();
        } catch (e) {
          message.error(e instanceof Error ? e.message : '删除失败');
        }
      },
    });
  };

  return (
    <div>
      <Card
        title="工作记录"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建
          </Button>
        }
      >
        <Space wrap className="work-records-filter-bar" align="center">
          <Radio.Group
            size="middle"
            optionType="button"
            buttonStyle="solid"
            value={filterType === '' ? 'all' : filterType}
            onChange={(e) => setFilterType(e.target.value === 'all' ? '' : e.target.value)}
            options={[
              { value: 'all', label: '全部' },
              { value: 'daily', label: '日报' },
              { value: 'weekly', label: '周报' },
            ]}
          />
          <Select
            size="middle"
            placeholder="部门"
            allowClear
            className="work-records-select-department"
            value={filterDepartmentId}
            onChange={onFilterDepartmentChange}
            options={departmentOptions.map((d) => ({ value: d.id, label: d.name }))}
          />
          <Select
            size="middle"
            placeholder="岗位"
            allowClear
            className="work-records-select-position"
            value={filterPositionId}
            onChange={setFilterPositionId}
            options={positionOptionsByDept.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Select
            size="middle"
            placeholder="记录人"
            allowClear
            className="work-records-select-recorder"
            value={filterRecorderId}
            onChange={setFilterRecorderId}
            options={userOptions.map((u) => ({ value: u.id, label: u.realName }))}
          />
          <DatePicker.RangePicker
            size="middle"
            value={filterDateRange}
            onChange={(dates) => setFilterDateRange(dates && dates[0] && dates[1] ? [dates[0], dates[1]] : null)}
          />
        </Space>
        <Table
          loading={loading}
          dataSource={list}
          rowKey="id"
          columns={[
            { title: '类型', dataIndex: 'type', key: 'type', render: (v: string) => (v === 'daily' ? '日报' : '周报') },
            { title: '所属日期', dataIndex: 'recordDate', key: 'recordDate' },
            { title: '记录人', dataIndex: 'recorderName', key: 'recorderName' },
            { title: '部门', dataIndex: 'recorderDepartmentName', key: 'recorderDepartmentName' },
            { title: '岗位', dataIndex: 'recorderPositionName', key: 'recorderPositionName' },
            {
              title: '总成绩',
              dataIndex: 'totalScore',
              key: 'totalScore',
              render: (v: number | undefined) => (v != null ? Number(v).toFixed(1) : '—'),
            },
            {
              title: '记录时间',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss.SSS') : ''),
            },
            {
              title: '操作',
              key: 'action',
              align: 'center',
              width: 140,
              render: (_, record) => {
                const isOwn = record.recorderId === user?.id;
                return (
                  <Space size="small">
                    <a onClick={() => navigate(`/work-records/${record.id}`)}>查看</a>
                    {isOwn ? (
                      <>
                        <a onClick={() => openEdit(record)}>编辑</a>
                        <a onClick={() => handleRemove(record)}>删除</a>
                      </>
                    ) : (
                      <>
                        <span className="work-records-action-disabled">编辑</span>
                        <span className="work-records-action-disabled">删除</span>
                      </>
                    )}
                  </Space>
                );
              },
            },
          ]}
        />
      </Card>
      <Modal
        title={editingId != null ? '编辑工作记录' : '新建工作记录'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        width={800}
      >
        <p className="work-records-modal-hint">每人每天仅一条日报、每人每周仅一条周报。</p>
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(_, all) => {
            if (editingId == null) saveWorkRecordFormCache(all);
          }}
        >
          <Form.Item name="type" label="类型" rules={[{ required: true }]} initialValue="weekly">
            <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: 'daily', label: '日报' }, { value: 'weekly', label: '周报' }]} />
          </Form.Item>
          <Form.Item name="recordDate" label="所属日期" rules={[{ required: true }]}>
            <DatePicker className="work-records-date-picker-full" />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}>
            <ContentMdEditor />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
