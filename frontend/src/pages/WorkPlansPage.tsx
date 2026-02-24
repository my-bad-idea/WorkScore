import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { Button, Card, Table, Space, Modal, Form, Input, InputNumber, Select, DatePicker, Tag, Tooltip, message } from 'antd';
import { PlusOutlined, HolderOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../stores/auth';
import { workPlansApi, usersApi } from '../api/client';
import type { WorkPlan } from '../api/client';
import './WorkPlansPage.css';

const STATUS_OPTIONS = [
  { value: 'pending', label: '待开始' },
  { value: 'in_progress', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
  { value: 'on_hold', label: '已搁置' },
  { value: 'delayed', label: '已延期' },
];

const PRIORITY_OPTIONS = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));
const PRIORITY_LABEL: Record<string, string> = Object.fromEntries(PRIORITY_OPTIONS.map((o) => [o.value, o.label]));

const STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  in_progress: 'processing',
  completed: 'success',
  cancelled: 'error',
  on_hold: 'warning',
  delayed: 'orange',
};

const PRIORITY_COLOR: Record<string, string> = {
  high: 'red',
  medium: 'blue',
  low: 'default',
};

type UserOption = { id: number; realName: string };

function fmtTime(v?: string) {
  return v ? dayjs(v).format('MM-DD HH:mm') : '—';
}

function fmtDuration(m?: number) {
  if (m == null) return '—';
  const days = Math.floor(m / (60 * 24));
  const hours = Math.floor((m % (60 * 24)) / 60);
  if (days > 0 && hours > 0) return `${days}天${hours}时`;
  if (days > 0) return `${days}天`;
  if (hours > 0) return `${hours}时`;
  return `${m}分`;
}

const DragListenersCtx = createContext<SyntheticListenerMap | undefined>(undefined);

function DragHandle() {
  const listeners = useContext(DragListenersCtx);
  return <HolderOutlined style={{ cursor: 'grab', color: '#999' }} {...listeners} />;
}

function SortableRow(props: React.HTMLAttributes<HTMLTableRowElement> & { 'data-row-key'?: string }) {
  const id = props['data-row-key'] ?? '';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, opacity: 0.8 } : {}),
  };
  return (
    <DragListenersCtx.Provider value={listeners}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes} />
    </DragListenersCtx.Provider>
  );
}

export default function WorkPlansPage() {
  const { user } = useAuth();
  const [list, setList] = useState<WorkPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptUsers, setDeptUsers] = useState<UserOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterPriority, setFilterPriority] = useState<string | undefined>();
  const [filterExecutorId, setFilterExecutorId] = useState<number | undefined>();
  const [filterUserId, setFilterUserId] = useState<number | undefined>();
  const [filterSystem, setFilterSystem] = useState<string | undefined>();
  const [filterModule, setFilterModule] = useState<string | undefined>();
  const [filterDateRange, setFilterDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadDeptUsers = async () => {
    try {
      const all = await usersApi.list();
      setDeptUsers(
        all
          .filter((u) => u.enabled && u.departmentId === user?.departmentId)
          .map((u) => ({ id: u.id, realName: u.realName || u.username })),
      );
    } catch {
      setDeptUsers([]);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (filterExecutorId != null) params.executorId = String(filterExecutorId);
      if (filterUserId != null) params.userId = String(filterUserId);
      if (filterSystem) params.system = filterSystem;
      if (filterModule) params.module = filterModule;
      if (filterDateRange?.[0]) params.plannedStartFrom = filterDateRange[0].format('YYYY-MM-DD');
      if (filterDateRange?.[1]) params.plannedStartTo = filterDateRange[1].format('YYYY-MM-DD');
      const data = await workPlansApi.list(params);
      setList(data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterExecutorId, filterUserId, filterSystem, filterModule, filterDateRange]);

  useEffect(() => { loadDeptUsers(); }, [user?.departmentId]);
  useEffect(() => { load(); }, [load]);

  const canEdit = (plan: WorkPlan) => user?.id === plan.userId || user?.id === plan.executorId;

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ userId: user?.id, priority: 'medium', status: 'pending' });
    setModalOpen(true);
  };

  const openEdit = (record: WorkPlan) => {
    setEditingId(record.id);
    form.resetFields();
    form.setFieldsValue({
      userId: record.userId,
      executorId: record.executorId ?? undefined,
      system: record.system,
      module: record.module,
      planContent: record.planContent,
      plannedRange: record.plannedStartAt && record.plannedEndAt
        ? [dayjs(record.plannedStartAt), dayjs(record.plannedEndAt)] : undefined,
      plannedDurationMinutes: record.plannedDurationMinutes,
      actualRange: record.actualStartAt && record.actualEndAt
        ? [dayjs(record.actualStartAt), dayjs(record.actualEndAt)] : undefined,
      actualDurationMinutes: record.actualDurationMinutes,
      priority: record.priority,
      status: record.status,
      remark: record.remark,
    });
    setModalOpen(true);
  };

  const calcMinutes = (range: [Dayjs, Dayjs] | null | undefined): number | undefined => {
    if (!range?.[0] || !range?.[1]) return undefined;
    return Math.round(range[1].diff(range[0], 'minute', true));
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const plannedRange = values.plannedRange as [Dayjs, Dayjs] | undefined;
      const actualRange = values.actualRange as [Dayjs, Dayjs] | undefined;
      const payload = {
        userId: values.userId,
        executorId: values.executorId ?? null,
        system: values.system || undefined,
        module: values.module || undefined,
        planContent: values.planContent,
        plannedStartAt: plannedRange?.[0]?.toISOString(),
        plannedEndAt: plannedRange?.[1]?.toISOString(),
        plannedDurationMinutes: values.plannedDurationMinutes ?? calcMinutes(plannedRange),
        actualStartAt: actualRange?.[0]?.toISOString(),
        actualEndAt: actualRange?.[1]?.toISOString(),
        actualDurationMinutes: values.actualDurationMinutes ?? calcMinutes(actualRange),
        priority: values.priority,
        status: values.status,
        remark: values.remark || undefined,
      };
      if (editingId != null) {
        await workPlansApi.update(editingId, payload);
        message.success('已更新');
      } else {
        await workPlansApi.create(payload);
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

  const handleRemove = (record: WorkPlan) => {
    Modal.confirm({
      title: '确认删除该工作计划？',
      onOk: async () => {
        try {
          await workPlansApi.remove(record.id);
          message.success('已删除');
          load();
        } catch (e) {
          message.error(e instanceof Error ? e.message : '删除失败');
        }
      },
    });
  };

  const onPlannedRangeChange = (dates: [Dayjs, Dayjs] | null) => {
    const mins = calcMinutes(dates);
    if (mins != null) form.setFieldValue('plannedDurationMinutes', mins);
  };

  const onActualRangeChange = (dates: [Dayjs, Dayjs] | null) => {
    const mins = calcMinutes(dates);
    if (mins != null) form.setFieldValue('actualDurationMinutes', mins);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex((i) => String(i.id) === String(active.id));
    const newIndex = list.findIndex((i) => String(i.id) === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(list, oldIndex, newIndex);
    setList(reordered);
    const items = reordered.map((item, idx) => ({ id: item.id, sortOrder: idx + 1 }));
    try {
      await workPlansApi.reorder(items);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '排序保存失败');
      load();
    }
  };

  const userOpts = deptUsers.map((u) => ({ value: u.id, label: u.realName }));

  return (
    <div>
      <Card
        title="工作计划"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建</Button>}
      >
        <Space wrap className="work-plans-filter-bar" align="center">
          <Select placeholder="状态" allowClear className="work-plans-select" value={filterStatus} onChange={setFilterStatus} options={STATUS_OPTIONS} />
          <Select placeholder="优先级" allowClear className="work-plans-select" value={filterPriority} onChange={setFilterPriority} options={PRIORITY_OPTIONS} />
          <Select placeholder="创建人" allowClear className="work-plans-select" value={filterUserId} onChange={setFilterUserId} options={userOpts} />
          <Select placeholder="执行人" allowClear className="work-plans-select" value={filterExecutorId} onChange={setFilterExecutorId} options={userOpts} />
          <Input placeholder="系统" allowClear className="work-plans-input-filter" value={filterSystem} onChange={(e) => setFilterSystem(e.target.value || undefined)} />
          <Input placeholder="模块" allowClear className="work-plans-input-filter" value={filterModule} onChange={(e) => setFilterModule(e.target.value || undefined)} />
          <DatePicker.RangePicker
            value={filterDateRange}
            onChange={(dates) => setFilterDateRange(dates && dates[0] && dates[1] ? [dates[0], dates[1]] : null)}
          />
        </Space>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={list.map((i) => String(i.id))} strategy={verticalListSortingStrategy}>
            <Table
              loading={loading}
              dataSource={list}
              rowKey="id"
              size="small"
              scroll={{ x: 1600 }}
              pagination={false}
              components={{ body: { row: SortableRow } }}
              onRow={(record) => ({ 'data-row-key': String(record.id) }) as React.HTMLAttributes<HTMLTableRowElement>}
              columns={[
                {
                  key: 'dragHandle', width: 36, align: 'center',
                  render: () => <DragHandle />,
                },
                { title: '序号', dataIndex: 'sortOrder', key: 'sortOrder', width: 50, align: 'center' },
                {
                  title: '优先级', dataIndex: 'priority', key: 'priority', width: 66, align: 'center',
                  render: (v: string) => <Tag color={PRIORITY_COLOR[v]}>{PRIORITY_LABEL[v] ?? v}</Tag>,
                },
                {
                  title: '状态', dataIndex: 'status', key: 'status', width: 76, align: 'center',
                  render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v] ?? v}</Tag>,
                },
                {
                  title: '系统/模块', key: 'systemModule', width: 120, ellipsis: true,
                  render: (_: unknown, r: WorkPlan) => {
                    const parts = [r.system, r.module].filter(Boolean).join('/');
                    return parts ? <Tooltip title={parts}>{parts}</Tooltip> : '—';
                  },
                },
                {
                  title: '计划内容', dataIndex: 'planContent', key: 'planContent', width: 200,
                  ellipsis: { showTitle: false },
                  render: (v: string) => <Tooltip placement="topLeft" title={v}>{v}</Tooltip>,
                },
                {
                  title: '计划起止', key: 'plannedRange', width: 200, ellipsis: true,
                  render: (_: unknown, r: WorkPlan) => `${fmtTime(r.plannedStartAt)} ~ ${fmtTime(r.plannedEndAt)}`,
                },
                { title: '计划时长', dataIndex: 'plannedDurationMinutes', key: 'plannedDuration', width: 76, render: fmtDuration },
                {
                  title: '实际起止', key: 'actualRange', width: 200, ellipsis: true,
                  render: (_: unknown, r: WorkPlan) => `${fmtTime(r.actualStartAt)} ~ ${fmtTime(r.actualEndAt)}`,
                },
                { title: '实际时长', dataIndex: 'actualDurationMinutes', key: 'actualDuration', width: 76, render: fmtDuration },
                { title: '创建人', dataIndex: 'ownerName', key: 'ownerName', width: 76 },
                { title: '执行人', dataIndex: 'executorName', key: 'executorName', width: 76, render: (v?: string) => v ?? '—' },
                {
                  title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 100,
                  render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '',
                },
                {
                  title: '操作', key: 'action', align: 'center', width: 100, fixed: 'right' as const,
                  render: (_: unknown, record: WorkPlan) => {
                    const editable = canEdit(record);
                    return (
                      <Space size="small">
                        {editable ? (
                          <>
                            <a onClick={() => openEdit(record)}>编辑</a>
                            <a onClick={() => handleRemove(record)}>删除</a>
                          </>
                        ) : (
                          <>
                            <span className="work-plans-action-disabled">编辑</span>
                            <span className="work-plans-action-disabled">删除</span>
                          </>
                        )}
                      </Space>
                    );
                  },
                },
              ]}
            />
          </SortableContext>
        </DndContext>
      </Card>
      <Modal
        title={editingId != null ? '编辑工作计划' : '新建工作计划'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        width={720}
        forceRender
      >
        <Form form={form} layout="vertical">
          {/* userId: always registered; visible (disabled) in edit, hidden in create */}
          <Form.Item name="userId" label="创建人" hidden={editingId == null}>
            <Select options={userOpts} disabled />
          </Form.Item>
          <div className="work-plans-form-row">
            <Form.Item name="system" label="系统" className="work-plans-form-half" rules={[{ required: true, message: '请填写系统' }]}>
              <Input placeholder="系统" />
            </Form.Item>
            <Form.Item name="module" label="模块" className="work-plans-form-half" rules={[{ required: true, message: '请填写模块' }]}>
              <Input placeholder="模块" />
            </Form.Item>
          </div>
          <Form.Item name="planContent" label="计划内容" rules={[{ required: true, message: '请填写计划内容' }]}>
            <Input.TextArea rows={2} placeholder="计划内容" />
          </Form.Item>
          <div className="work-plans-form-row">
            <Form.Item name="priority" label="优先级" className="work-plans-form-half" rules={[{ required: true }]}>
              <Select options={PRIORITY_OPTIONS} />
            </Form.Item>
            <Form.Item name="status" label="状态" className="work-plans-form-half" rules={[{ required: true }]}>
              <Select options={STATUS_OPTIONS} />
            </Form.Item>
          </div>
          <Form.Item name="executorId" label="执行人" rules={[{ required: true, message: '请选择执行人' }]}>
            <Select options={userOpts} placeholder="请选择执行人" />
          </Form.Item>
          <div className="work-plans-form-row">
            <Form.Item name="plannedRange" label="计划起止时间" className="work-plans-form-flex" rules={[{ required: true, message: '请选择计划起止时间' }]}>
              <DatePicker.RangePicker
                showTime
                style={{ width: '100%' }}
                onChange={(dates) => onPlannedRangeChange(dates as [Dayjs, Dayjs] | null)}
              />
            </Form.Item>
            <Form.Item name="plannedDurationMinutes" label="时长(分)" rules={[{ required: true, message: '请填写时长' }]}>
              <InputNumber min={0} style={{ width: 90 }} />
            </Form.Item>
          </div>
          <div className="work-plans-form-row">
            <Form.Item name="actualRange" label="实际起止时间" className="work-plans-form-flex">
              <DatePicker.RangePicker
                showTime
                style={{ width: '100%' }}
                onChange={(dates) => onActualRangeChange(dates as [Dayjs, Dayjs] | null)}
              />
            </Form.Item>
            <Form.Item name="actualDurationMinutes" label="时长(分)">
              <InputNumber min={0} style={{ width: 90 }} />
            </Form.Item>
          </div>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={1} placeholder="备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
