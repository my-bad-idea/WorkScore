import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Button, Descriptions, Modal, Form, Select, DatePicker, Input, InputNumber, message, Table } from 'antd';
import dayjs from 'dayjs';
import ReactMarkdown from 'react-markdown';
import MdEditor from '@uiw/react-md-editor';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useAuth } from '../stores/auth';
import { useThemeMode } from '../theme/ThemeContext';
import { workRecordsApi, scoresApi } from '../api/client';
import './WorkRecordDetailPage.css';

type RecordDetail = {
  id: number;
  type: string;
  recordDate: string;
  content: string;
  recorderId: number;
  recorderName: string;
  createdAt: string;
  updatedAt: string;
};

type ScoreItem = {
  id: number;
  scoreType: string;
  totalScore: number;
  remark: string | null;
  scoredAt: string;
  scorerName: string;
  scorerId: number;
};

export default function WorkRecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const themeMode = useThemeMode();
  const { modal } = App.useApp();
  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [scores, setScores] = useState<ScoreItem[]>([]);
  const [summary, setSummary] = useState<{ totalScore: number } | null>(null);
  const [criteria, setCriteria] = useState<{ name: string; weight?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [remarkDetailScore, setRemarkDetailScore] = useState<ScoreItem | null>(null);
  const [form] = Form.useForm();
  const [scoreForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [rec, sc, sum] = await Promise.all([
        workRecordsApi.get(Number(id)),
        scoresApi.listByWorkRecord(Number(id)),
        scoresApi.getSummary(Number(id)),
      ]);
      setRecord(rec);
      setScores(sc);
      setSummary(sum);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const openEdit = () => {
    if (!record) return;
    form.setFieldsValue({
      type: record.type,
      recordDate: dayjs(record.recordDate),
      content: record.content,
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async () => {
    const values = await form.validateFields();
    const recordDate = dayjs(values.recordDate).format('YYYY-MM-DD');
    setSubmitting(true);
    try {
      await workRecordsApi.update(record!.id, { type: values.type, recordDate, content: values.content });
      message.success('已更新');
      setEditModalOpen(false);
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = () => {
    if (!record || record.recorderId !== user?.id) return;
    modal.confirm({
      title: '确认删除？',
      onOk: async () => {
        try {
          await workRecordsApi.remove(record.id);
          message.success('已删除');
          navigate('/work-records');
        } catch (e) {
          message.error(e instanceof Error ? e.message : '删除失败');
        }
      },
    });
  };

  const openScoreModal = async () => {
    try {
      let c = await scoresApi.getCriteria(Number(id));
      if (c.length === 0 && record && record.recorderId === user?.id) {
        c = [{ name: '自评', weight: 1 }];
      }
      setCriteria(c);
      const initial: Record<string, number | string> = { totalScore: 0, remark: '' };
      c.forEach((item) => { initial[`score_${item.name}`] = 0; });
      scoreForm.setFieldsValue(initial);
      setScoreModalOpen(true);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载考核标准失败');
    }
  };

  const handleScoreSubmit = async () => {
    const values = await scoreForm.validateFields();
    const scoreDetails = criteria.map((item) => ({
      item_name: item.name,
      score: Number(values[`score_${item.name}`]) || 0,
    }));
    setSubmitting(true);
    try {
      await scoresApi.createScore(Number(id!), {
        scoreDetails,
        totalScore: Number(values.totalScore),
        remark: values.remark,
      });
      message.success('评分已提交');
      setScoreModalOpen(false);
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteScore = (scoreId: number, scorerId: number) => {
    if (scorerId !== user?.id) return;
    modal.confirm({
      title: '确认删除该评分？',
      onOk: async () => {
        try {
          await scoresApi.removeScore(scoreId);
          message.success('已删除');
          load();
        } catch (e) {
          message.error(e instanceof Error ? e.message : '删除失败');
        }
      },
    });
  };

  if (loading || !record) return null;

  const isRecorder = record.recorderId === user?.id;
  const hasScoredByMe = scores.some((s) => s.scoreType === 'manual' && s.scorerId === user?.id);
  const showScoreButton = !isRecorder && !hasScoredByMe;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} className="work-record-detail-back">
        返回
      </Button>
      <Card
        title={`工作记录 #${record.id}`}
        extra={
          isRecorder ? (
            <span>
              <Button onClick={openEdit} className="work-record-detail-edit-btn">编辑</Button>
              <Button danger onClick={handleRemove}>删除</Button>
            </span>
          ) : null
        }
      >
        <Descriptions column={1} bordered className="work-record-detail-descriptions">
          <Descriptions.Item label="类型">{record.type === 'daily' ? '日报' : '周报'}</Descriptions.Item>
          <Descriptions.Item label="所属日期">{record.recordDate}</Descriptions.Item>
          <Descriptions.Item label="记录人">{record.recorderName}</Descriptions.Item>
          <Descriptions.Item label="记录时间">{record.createdAt ? dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss.SSS') : ''}</Descriptions.Item>
          <Descriptions.Item label="内容">
            <div className="markdown-preview work-record-detail-content">
              {record.content ? <ReactMarkdown>{record.content}</ReactMarkdown> : '无'}
            </div>
          </Descriptions.Item>
        </Descriptions>
        {summary != null && (
          <p className="work-record-detail-summary">
            <strong>总成绩：</strong>{summary.totalScore.toFixed(1)}
          </p>
        )}
        <Card
          type="inner"
          title="评分列表"
          className="work-record-detail-scores-card"
          extra={
            showScoreButton && (
              <Button type="primary" size="small" onClick={openScoreModal}>
                人工评分
              </Button>
            )
          }
        >
          <Table
            dataSource={scores}
            rowKey="id"
            size="small"
            columns={[
              { title: '类型', dataIndex: 'scoreType', key: 'scoreType', render: (v: string) => (v === 'ai' ? 'AI' : '人工') },
              { title: '总分', dataIndex: 'totalScore', key: 'totalScore' },
              {
                title: '评分说明',
                dataIndex: 'remark',
                key: 'remark',
                width: 200,
                ellipsis: true,
                render: (remark: string | null) => (
                  <span className="work-record-detail-remark-ellipsis" title={remark ?? ''}>
                    {remark ?? '无'}
                  </span>
                ),
              },
              { title: '评分人', dataIndex: 'scorerName', key: 'scorerName', render: (v: string, r: ScoreItem) => (r.scoreType === 'ai' ? 'AI' : v) },
              {
                title: '时间',
                dataIndex: 'scoredAt',
                key: 'scoredAt',
                render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss.SSS') : ''),
              },
              {
                title: '操作',
                key: 'action',
                align: 'center',
                width: 120,
                render: (_, r) => {
                  const canDelete = r.scoreType === 'manual' && r.scorerId === user?.id;
                  return (
                    <span className="work-record-detail-actions">
                      <a onClick={() => setRemarkDetailScore(r)}>查看</a>
                      {canDelete ? (
                        <>
                          <span className="work-record-detail-action-sep">|</span>
                          <a onClick={() => handleDeleteScore(r.id, r.scorerId)}>删除</a>
                        </>
                      ) : (
                        <>
                          <span className="work-record-detail-action-sep">|</span>
                          <span className="work-record-detail-action-disabled">删除</span>
                        </>
                      )}
                    </span>
                  );
                },
              },
            ]}
          />
        </Card>
      </Card>
      <Modal title="编辑工作记录" open={editModalOpen} onOk={handleEditSubmit} onCancel={() => setEditModalOpen(false)} confirmLoading={submitting} width={640}>
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'daily', label: '日报' }, { value: 'weekly', label: '周报' }]} />
          </Form.Item>
          <Form.Item name="recordDate" label="所属日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="content" label="内容（Markdown）" rules={[{ required: true }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="人工评分" open={scoreModalOpen} onOk={handleScoreSubmit} onCancel={() => setScoreModalOpen(false)} confirmLoading={submitting} width={480}>
        <Form form={scoreForm} layout="vertical">
          {criteria.map((item) => (
            <Form.Item key={item.name} name={`score_${item.name}`} label={`${item.name} (0-100)`} rules={[{ required: true }]}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          ))}
          <Form.Item name="totalScore" label="总分" rules={[{ required: true, message: '请填写总分' }]}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="0–100" />
          </Form.Item>
          <Form.Item name="remark" label="评分说明" rules={[{ required: true, message: '请填写评分说明' }]}>
            <Input.TextArea rows={2} placeholder="请填写评分说明" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="评分说明详情"
        open={remarkDetailScore != null}
        onCancel={() => setRemarkDetailScore(null)}
        footer={null}
        width={720}
      >
        {remarkDetailScore && (
          <div className="work-record-detail-remark-detail">
            <p><strong>类型：</strong>{remarkDetailScore.scoreType === 'ai' ? 'AI' : '人工'}</p>
            <p><strong>总分：</strong>{remarkDetailScore.totalScore}</p>
            <p><strong>评分人：</strong>{remarkDetailScore.scoreType === 'ai' ? 'AI' : remarkDetailScore.scorerName}</p>
            <p><strong>时间：</strong>{remarkDetailScore.scoredAt ? dayjs(remarkDetailScore.scoredAt).format('YYYY-MM-DD HH:mm:ss') : ''}</p>
            <div className="work-record-detail-remark-detail-content">
              <strong>评分说明：</strong>
              <div className="work-record-detail-remark-detail-text">
                <MdEditor
                  value={remarkDetailScore.remark ?? ''}
                  preview="preview"
                  hideToolbar
                  visibleDragbar={false}
                  height={360}
                  extraCommands={[]}
                  enableScroll={true}
                  data-color-mode={themeMode}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
