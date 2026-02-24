import { useEffect, useState } from 'react';
import { Button, Card, Table, Space, Modal, Form, Input, Select, Switch, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../../stores/auth';
import { canEditUser, roleLabel } from '../../utils/permissions';
import type { UserRole } from '../../stores/auth';
import { usersApi, departmentsApi, positionsApi } from '../../api/client';
import { passwordStrengthRule } from '../../utils/password';
import './system-pages.css';

type UserItem = {
  id: number;
  username: string;
  realName: string;
  departmentId: number;
  positionId?: number;
  departmentName?: string;
  positionName?: string;
  isAdmin: boolean;
  role?: string;
  enabled: boolean;
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'user', label: '普通用户' },
  { value: 'department_admin', label: '部门管理员' },
  { value: 'system_admin', label: '系统管理员' },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const canAdd = currentUser?.role === 'system_admin' || currentUser?.role === 'department_admin';
  const [list, setList] = useState<UserItem[]>([]);
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [positions, setPositions] = useState<{ id: number; name: string; departmentId: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [userData, deptData, posData] = await Promise.all([usersApi.list(), departmentsApi.list(), positionsApi.list()]);
      setList(userData);
      setDepartments(deptData.map((d) => ({ id: d.id, name: d.name })));
      setPositions(posData.map((p) => ({ id: p.id, name: p.name, departmentId: p.departmentId })));
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
    form.setFieldsValue({ username: '', password: '', realName: '', departmentId: undefined, positionId: undefined, role: 'user', enabled: true });
    setModalOpen(true);
  };

  const openEdit = (record: UserItem) => {
    setEditingId(record.id);
    form.setFieldsValue({
      username: record.username,
      password: '',
      realName: record.realName,
      departmentId: record.departmentId,
      positionId: record.positionId,
      role: record.role === 'system_admin' || record.role === 'department_admin' ? record.role : 'user',
      enabled: record.enabled,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (editingId != null) {
        const body: Parameters<typeof usersApi.update>[1] = {
          username: values.username,
          realName: values.realName,
          departmentId: values.departmentId,
          positionId: values.positionId,
          enabled: values.enabled,
        };
        if (values.password) body.password = values.password;
        if (currentUser?.role === 'system_admin' && values.role != null) body.role = values.role;
        await usersApi.update(editingId, body);
        message.success('已更新');
      } else {
        const createBody: Parameters<typeof usersApi.create>[0] = {
          username: values.username,
          realName: values.realName,
          departmentId: values.departmentId,
          positionId: values.positionId,
          enabled: values.enabled,
        };
        if (values.password && values.password.trim()) createBody.password = values.password.trim();
        if (currentUser?.role === 'system_admin' && values.role != null) createBody.role = values.role;
        await usersApi.create(createBody);
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
    if (id === currentUser?.id) {
      message.error('不能删除当前登录用户');
      return;
    }
    Modal.confirm({ title: '确认删除？', onOk: async () => {
      try {
        await usersApi.remove(id);
        message.success('已删除');
        load();
      } catch (e) {
        message.error(e instanceof Error ? e.message : '删除失败');
      }
    } });
  };

  const deptId = Form.useWatch('departmentId', form);
  const positionOptions = positions.filter((p) => p.departmentId === deptId).map((p) => ({ value: p.id, label: p.name }));

  return (
    <>
      <Card
        title="人员管理"
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
          scroll={{ x: 750 }}
          columns={[
            { title: '账号', dataIndex: 'username', key: 'username', width: 120, ellipsis: true },
            { title: '姓名', dataIndex: 'realName', key: 'realName', width: 100 },
            { title: '部门', dataIndex: 'departmentName', key: 'departmentName', width: 110, ellipsis: true },
            { title: '岗位', dataIndex: 'positionName', key: 'positionName', width: 110, ellipsis: true },
            {
              title: '角色', dataIndex: 'role', key: 'role', width: 100,
              render: (_: unknown, r: UserItem) => roleLabel((r.role === 'system_admin' || r.role === 'department_admin' ? r.role : 'user') as UserRole),
            },
            { title: '启用', dataIndex: 'enabled', key: 'enabled', width: 60, align: 'center' as const, render: (v: boolean) => (v ? '是' : '否') },
            {
              title: '操作', key: 'action', align: 'center' as const, width: 110, fixed: 'right' as const,
              render: (_: unknown, record: UserItem) => {
                const canEdit = canEditUser(currentUser ?? null, record);
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
        title={editingId != null ? '编辑人员' : '新增人员'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="账号" rules={[{ required: true }]}>
            <Input placeholder="登录账号" disabled={editingId != null} />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            extra={editingId == null ? '不填则使用系统设置中的默认人员密码' : '不填则不修改'}
            rules={[passwordStrengthRule()]}
          >
            <Input.Password placeholder={editingId != null ? '不填则不修改' : '选填，不填则使用默认密码'} />
          </Form.Item>
          <Form.Item name="realName" label="姓名" rules={[{ required: true }]}>
            <Input placeholder="姓名" />
          </Form.Item>
          <Form.Item name="departmentId" label="部门" rules={[{ required: true }]}>
            <Select placeholder="选择部门" options={departments.map((d) => ({ value: d.id, label: d.name }))} />
          </Form.Item>
          <Form.Item name="positionId" label="岗位" rules={[{ required: true, message: '请选择岗位' }]}>
            <Select placeholder="选择岗位" options={positionOptions} />
          </Form.Item>
          {currentUser?.role === 'system_admin' && (
            <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
              <Select placeholder="选择角色" options={ROLE_OPTIONS} />
            </Form.Item>
          )}
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
