import { useEffect, useState } from 'react';
import { Button, Card, Table, Space, Modal, Form, Input, Switch, message, Descriptions } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../../stores/auth';
import { canEditDepartment } from '../../utils/permissions';
import { departmentsApi } from '../../api/client';
import './system-pages.css';

export default function DepartmentsPage() {
  const { user } = useAuth();
  const canEdit = canEditDepartment(user);
  const [list, setList] = useState<{ id: number; name: string; enabled: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<{ id: number; name: string; enabled: boolean } | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await departmentsApi.list();
      setList(data);
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
    form.setFieldsValue({ name: '', enabled: true });
    setModalOpen(true);
  };

  const openEdit = (record: { id: number; name: string; enabled: boolean }) => {
    setEditingId(record.id);
    form.setFieldsValue({ name: record.name, enabled: record.enabled });
    setModalOpen(true);
  };

  const openView = (record: { id: number; name: string; enabled: boolean }) => {
    setViewing(record);
    setViewModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (editingId != null) {
        await departmentsApi.update(editingId, { name: values.name, enabled: values.enabled });
        message.success('已更新');
      } else {
        await departmentsApi.create({ name: values.name, enabled: values.enabled });
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
        await departmentsApi.remove(id);
        message.success('已删除');
        load();
      } catch (e) {
        message.error(e instanceof Error ? e.message : '删除失败');
      }
    } });
  };

  return (
    <>
      <Card
        title="部门管理"
        extra={
          canEdit ? (
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
            { title: '名称', dataIndex: 'name', key: 'name', ellipsis: true },
            { title: '启用', dataIndex: 'enabled', key: 'enabled', width: 60, align: 'center' as const, render: (v: boolean) => (v ? '是' : '否') },
            {
              title: '操作',
              key: 'action',
              align: 'center',
              width: 160,
              fixed: 'right',
              render: (_, record) => (
                <Space>
                  <a className="system-table-action-link" onClick={() => openView(record)}>
                    查看
                  </a>
                  <a className={`system-table-action-link ${!canEdit ? 'disabled' : ''}`} onClick={() => canEdit && openEdit(record)}>
                    编辑
                  </a>
                  <a className={`system-table-action-link ${!canEdit ? 'disabled' : ''}`} onClick={() => canEdit && handleRemove(record.id)}>
                    删除
                  </a>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={editingId != null ? '编辑部门' : '新增部门'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="部门名称" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="查看部门"
        open={viewModalOpen}
        onCancel={() => setViewModalOpen(false)}
        footer={null}
      >
        {viewing && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="ID">{viewing.id}</Descriptions.Item>
            <Descriptions.Item label="名称">{viewing.name}</Descriptions.Item>
            <Descriptions.Item label="启用">{viewing.enabled ? '是' : '否'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  );
}
