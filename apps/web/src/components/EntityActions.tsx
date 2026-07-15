import { useState } from 'react';
import { Button, Checkbox, Divider, Input, Modal, Select, Space } from 'antd';
import { EditOutlined, ShareAltOutlined } from '@ant-design/icons';
import { InlineDeleteButton } from './InlineDeleteButton';

export interface EntityActionsProps {
  entityLabel: 'source' | 'agent' | 'playbook';
  isOwner: boolean;
  onEdit?: () => void | Promise<void>;
  /** When provided the delete button is shown — only pass on views where delete is appropriate (e.g. edit modal). */
  onDelete?: () => void | Promise<void>;
  onShare?: (payload: { granteeUserId: string; permission: string; expiresAt?: string }) => void | Promise<void>;
  sharePermissions?: string[];
  onPublish?: (payload: { title: string; summary?: string; visibility?: 'public' | 'private' }) => void | Promise<void>;
  defaultPublishTitle: string;
}

/** Combined Share & Publish dialog — the user picks whether to share with a user, publish to
 *  the marketplace, or both in one action. Share+Publish are merged so the card never shows
 *  two separate icon buttons for the same concept. */
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Share-with-user section
  const [shareUserId, setShareUserId] = useState('');
  const [sharePermission, setSharePermission] = useState(sharePermissions[0] ?? 'read');
  const [shareEnabled, setShareEnabled] = useState(false);

  // Publish-to-marketplace section
  const [publishTitle, setPublishTitle] = useState(defaultPublishTitle);
  const [publishSummary, setPublishSummary] = useState('');
  const [publishVisibility, setPublishVisibility] = useState<'public' | 'private'>('public');
  const [publishEnabled, setPublishEnabled] = useState(false);

  if (!isOwner) return null;

  const canSubmit = (shareEnabled && shareUserId.trim()) || (publishEnabled && publishTitle.trim());

  function openDialog() {
    setPublishTitle(defaultPublishTitle);
    setShareEnabled(false);
    setPublishEnabled(false);
    setShareUserId('');
    setOpen(true);
  }

  async function onOk() {
    setLoading(true);
    try {
      if (shareEnabled && shareUserId.trim() && onShare) {
        await onShare({ granteeUserId: shareUserId.trim(), permission: sharePermission });
      }
      if (publishEnabled && publishTitle.trim() && onPublish) {
        await onPublish({ title: publishTitle.trim(), summary: publishSummary.trim() || undefined, visibility: publishVisibility });
      }
      setOpen(false);
      setShareUserId('');
      setPublishSummary('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Space size={4}>
        {onEdit ? (
          <Button aria-label={`Edit ${entityLabel}`} shape="circle" icon={<EditOutlined />} onClick={() => void onEdit()} />
        ) : null}
        {onDelete ? (
          <InlineDeleteButton
            onConfirm={onDelete}
            ariaLabel={`Remove ${entityLabel}`}
            confirmText="Remove"
          />
        ) : null}
        {(onShare || onPublish) ? (
          <Button aria-label={`Share or publish ${entityLabel}`} shape="circle" icon={<ShareAltOutlined />} onClick={openDialog} />
        ) : null}
      </Space>

      <Modal
        title={`Share / Publish ${entityLabel}`}
        open={open}
        okText="Apply"
        okButtonProps={{ loading, disabled: !canSubmit }}
        onCancel={() => setOpen(false)}
        onOk={onOk}
        destroyOnHidden
      >
        <Space direction="vertical" className="w-full" size={12}>
          {onShare ? (
            <div>
              <Checkbox
                aria-label={`share-with-user-toggle`}
                checked={shareEnabled}
                onChange={(e) => setShareEnabled(e.target.checked)}
              >
                Share with a specific user
              </Checkbox>
              {shareEnabled ? (
                <Space direction="vertical" className="mt-2 w-full" size={8}>
                  <Input
                    aria-label={`${entityLabel}-share-user-id`}
                    placeholder="Target user ID"
                    value={shareUserId}
                    onChange={(e) => setShareUserId(e.currentTarget.value)}
                  />
                  <Select
                    aria-label={`${entityLabel}-share-permission`}
                    value={sharePermission}
                    options={sharePermissions.map((permission) => ({ value: permission, label: permission }))}
                    onChange={(value) => setSharePermission(value)}
                    className="w-full"
                  />
                </Space>
              ) : null}
            </div>
          ) : null}

          {onShare && onPublish ? <Divider style={{ margin: '4px 0' }} /> : null}

          {onPublish ? (
            <div>
              <Checkbox
                aria-label={`publish-to-marketplace-toggle`}
                checked={publishEnabled}
                onChange={(e) => setPublishEnabled(e.target.checked)}
              >
                Publish to marketplace
              </Checkbox>
              {publishEnabled ? (
                <Space direction="vertical" className="mt-2 w-full" size={8}>
                  <Input
                    aria-label={`${entityLabel}-publish-title`}
                    placeholder="Title"
                    value={publishTitle}
                    onChange={(e) => setPublishTitle(e.currentTarget.value)}
                  />
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
                      { value: 'public', label: 'Public' },
                      { value: 'private', label: 'Private' }
                    ]}
                    onChange={(value) => setPublishVisibility(value as 'public' | 'private')}
                    className="w-full"
                  />
                </Space>
              ) : null}
            </div>
          ) : null}
        </Space>
      </Modal>
    </>
  );
}
