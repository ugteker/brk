import { useState } from 'react';
import { Button, Input, Modal, Popconfirm, Select, Space } from 'antd';
import { DeleteOutlined, EditOutlined, ShareAltOutlined, UploadOutlined } from '@ant-design/icons';

export interface EntityActionsProps {
  entityLabel: 'source' | 'agent' | 'playbook';
  isOwner: boolean;
  onEdit?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onShare?: (payload: { granteeUserId: string; permission: string; expiresAt?: string }) => void | Promise<void>;
  sharePermissions?: string[];
  onPublish?: (payload: { title: string; summary?: string; visibility?: 'public' | 'private' }) => void | Promise<void>;
  defaultPublishTitle: string;
}

export function EntityActions({
  entityLabel,
  isOwner,
  onEdit,
  onDelete,
  onShare,
  sharePermissions = ['read'],
  onPublish,
  defaultPublishTitle
}: EntityActionsProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUserId, setShareUserId] = useState('');
  const [sharePermission, setSharePermission] = useState(sharePermissions[0] ?? 'read');
  const [shareLoading, setShareLoading] = useState(false);

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState(defaultPublishTitle);
  const [publishSummary, setPublishSummary] = useState('');
  const [publishVisibility, setPublishVisibility] = useState<'public' | 'private'>('public');
  const [publishLoading, setPublishLoading] = useState(false);

  if (!isOwner) return null;

  return (
    <>
      <Space size={4}>
        {onEdit ? (
          <Button aria-label={`Edit ${entityLabel}`} shape="circle" icon={<EditOutlined />} onClick={() => void onEdit()} />
        ) : null}
        {onShare ? (
          <Button aria-label={`Share ${entityLabel}`} shape="circle" icon={<ShareAltOutlined />} onClick={() => setShareOpen(true)} />
        ) : null}
        {onPublish ? (
          <Button
            aria-label={`Publish ${entityLabel}`}
            shape="circle"
            icon={<UploadOutlined />}
            onClick={() => {
              setPublishTitle(defaultPublishTitle);
              setPublishOpen(true);
            }}
          />
        ) : null}
        {onDelete ? (
          <Popconfirm title={`Remove this ${entityLabel}?`} okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => onDelete()}>
            <Button aria-label={`Remove ${entityLabel}`} shape="circle" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ) : null}
      </Space>

      <Modal
        title={`Share ${entityLabel}`}
        open={shareOpen}
        okText="Share"
        okButtonProps={{ loading: shareLoading, disabled: !shareUserId.trim() }}
        onCancel={() => setShareOpen(false)}
        onOk={async () => {
          if (!onShare) return;
          setShareLoading(true);
          try {
            await onShare({ granteeUserId: shareUserId.trim(), permission: sharePermission });
            setShareOpen(false);
            setShareUserId('');
          } finally {
            setShareLoading(false);
          }
        }}
        destroyOnHidden
      >
        <Space direction="vertical" className="w-full" size={8}>
          <Input aria-label={`${entityLabel}-share-user-id`} placeholder="Target user ID" value={shareUserId} onChange={(e) => setShareUserId(e.currentTarget.value)} />
          <Select
            aria-label={`${entityLabel}-share-permission`}
            value={sharePermission}
            options={sharePermissions.map((permission) => ({ value: permission, label: permission }))}
            onChange={(value) => setSharePermission(value)}
          />
        </Space>
      </Modal>

      <Modal
        title={`Publish ${entityLabel} to marketplace`}
        open={publishOpen}
        okText="Publish"
        okButtonProps={{ loading: publishLoading, disabled: !publishTitle.trim() }}
        onCancel={() => setPublishOpen(false)}
        onOk={async () => {
          if (!onPublish) return;
          setPublishLoading(true);
          try {
            await onPublish({
              title: publishTitle.trim(),
              summary: publishSummary.trim() || undefined,
              visibility: publishVisibility
            });
            setPublishOpen(false);
            setPublishSummary('');
          } finally {
            setPublishLoading(false);
          }
        }}
        destroyOnHidden
      >
        <Space direction="vertical" className="w-full" size={8}>
          <Input aria-label={`${entityLabel}-publish-title`} placeholder="Title" value={publishTitle} onChange={(e) => setPublishTitle(e.currentTarget.value)} />
          <Input.TextArea
            aria-label={`${entityLabel}-publish-summary`}
            placeholder="Summary (optional)"
            value={publishSummary}
            onChange={(e) => setPublishSummary(e.currentTarget.value)}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
          <Select
            aria-label={`${entityLabel}-publish-visibility`}
            value={publishVisibility}
            options={[
              { value: 'public', label: 'public' },
              { value: 'private', label: 'private' }
            ]}
            onChange={(value) => setPublishVisibility(value as 'public' | 'private')}
          />
        </Space>
      </Modal>
    </>
  );
}
