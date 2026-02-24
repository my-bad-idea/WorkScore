import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, Table, Select, Button, message, Tooltip, Tag } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { scoreQueueApi } from '../api/client';
import './ScoreQueuePage.css';

const AUTO_REFRESH_OPTIONS = [
  { value: 0, label: '不自动刷新' },
  { value: 5, label: '5 秒' },
  { value: 10, label: '10 秒' },
  { value: 30, label: '30 秒' },
  { value: 60, label: '60 秒' },
];

type QueueItem = {
  id: number;
  workRecordId: number;
  status: string;
  createdAt: string;
  processedAt: string | null;
  errorMessage: string | null;
  type: string;
  recordDate: string;
  recorderName: string;
};

export default function ScoreQueuePage() {
  const navigate = useNavigate();
  const [list, setList] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState(10);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await scoreQueueApi.list(statusFilter ? { status: statusFilter } : undefined);
      setList(data);
    } catch (e) {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // 自动刷新：间隔 > 0 时定时拉取
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (autoRefreshSeconds > 0) {
      intervalRef.current = setInterval(() => load(), autoRefreshSeconds * 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefreshSeconds, load]);

  const statusLabels: Record<string, string> = {
    pending: '待处理',
    processing: '处理中',
    done: '已完成',
    failed: '失败',
  };

  const formatDateTime = (v: string | null | undefined) =>
    v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '';

  const copyError = (text: string | null | undefined) => {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => message.success('已复制到剪贴板'));
  };

  return (
    <div>
      <Card
        title="智能考核队列"
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => load()} style={{ marginRight: 8 }}>
              刷新
            </Button>
            <Select
              placeholder="自动刷新"
              style={{ width: 120, marginRight: 8 }}
              value={autoRefreshSeconds}
              onChange={setAutoRefreshSeconds}
              options={AUTO_REFRESH_OPTIONS}
            />
            <Select
              placeholder="状态"
              allowClear
              style={{ width: 120 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'pending', label: '待处理' },
                { value: 'processing', label: '处理中' },
                { value: 'done', label: '已完成' },
                { value: 'failed', label: '失败' },
              ]}
            />
          </>
        }
      >
        <Table
          loading={loading}
          dataSource={list}
          rowKey="id"
          size="middle"
          scroll={{ x: 1050 }}
          columns={[
            {
              title: '类型', dataIndex: 'type', key: 'type', width: 70,
              render: (v: string, record: QueueItem) => (
                <a
                  className="score-queue-type-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/work-records/${record.workRecordId}`);
                  }}
                >
                  {v === 'daily' ? '日报' : '周报'}
                </a>
              ),
            },
            { title: '所属日期', dataIndex: 'recordDate', key: 'recordDate', width: 110 },
            { title: '记录人', dataIndex: 'recorderName', key: 'recorderName', width: 90 },
            {
              title: '状态', dataIndex: 'status', key: 'status', width: 80, align: 'center' as const,
              render: (v: string) => {
                const label = statusLabels[v] ?? v;
                const colorMap: Record<string, string> = { pending: 'blue', processing: 'orange', done: 'green', failed: 'red' };
                return <Tag color={colorMap[v]} className="score-queue-status-tag">{label}</Tag>;
              },
            },
            { title: '入队时间', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (v: string) => formatDateTime(v) },
            { title: '处理时间', dataIndex: 'processedAt', key: 'processedAt', width: 160, render: (v: string | null) => formatDateTime(v) },
            {
              title: '错误信息',
              dataIndex: 'errorMessage',
              key: 'errorMessage',
              width: 280,
              ellipsis: { showTitle: false },
              render: (msg: string | null) =>
                msg ? (
                  <div className="score-queue-error-cell">
                    <Tooltip title={<span className="score-queue-error-tooltip-content">{msg}</span>} getPopupContainer={() => document.body}>
                      <span className="score-queue-error-text">{msg}</span>
                    </Tooltip>
                    <Button
                      type="link"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyError(msg);
                      }}
                      title="复制全文"
                      className="score-queue-error-copy-btn"
                    />
                  </div>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
