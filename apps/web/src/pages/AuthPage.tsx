import { useEffect, useState } from 'react';
import { Alert, Button, Card, Divider, Form, Input, Result, Segmented, Typography } from 'antd';
import { GoogleOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { GOOGLE_SIGN_IN_URL, forgotPassword, resendConfirmation, resetPassword } from '../api/auth';

const { Title, Paragraph } = Typography;

type Mode = 'login' | 'signup';
type View = 'form' | 'confirmationSent' | 'forgotPassword' | 'resetPassword';

function readQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    emailConfirmed: params.get('emailConfirmed'),
    accountLocked: params.get('accountLocked'),
    resetToken: params.get('resetToken')
  };
}

export function AuthPage() {
  const { login, signup } = useAuth();
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('login');
  const [view, setView] = useState<View>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoBanner, setInfoBanner] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    const { emailConfirmed, accountLocked, resetToken: token } = readQueryParams();

    if (token) {
      setResetToken(token);
      setView('resetPassword');
    } else if (emailConfirmed === '1') {
      setInfoBanner({ type: 'success', message: t('auth.bannerEmailConfirmed') });
    } else if (emailConfirmed === '0') {
      setInfoBanner({ type: 'error', message: t('auth.bannerEmailInvalid') });
    } else if (accountLocked === '1') {
      setInfoBanner({ type: 'warning', message: t('auth.bannerAccountLocked') });
    }

    if (emailConfirmed || accountLocked || token) {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url.toString());
    }
  }, [t]);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        const result = await signup(email, password);
        setConfirmedEmail(result.email);
        setView('confirmationSent');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorFallback'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setResendState('sending');
    try {
      await resendConfirmation(confirmedEmail);
    } finally {
      setResendState('sent');
    }
  }

  async function onRequestReset() {
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(email);
      setInfoBanner({ type: 'success', message: t('auth.bannerResetSent') });
      setView('form');
      setMode('login');
    } finally {
      setSubmitting(false);
    }
  }

  async function onResetPassword() {
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword(resetToken as string, newPassword);
      setInfoBanner({ type: 'success', message: t('auth.bannerPasswordReset') });
      setView('form');
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.resetFailFallback'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ marginBottom: 0 }}>
          {t('auth.title')}
        </Title>
        <Paragraph type="secondary">{t('auth.subtitle')}</Paragraph>

        {infoBanner ? (
          <Alert
            type={infoBanner.type}
            message={infoBanner.message}
            showIcon
            closable
            onClose={() => setInfoBanner(null)}
            style={{ marginBottom: 16 }}
          />
        ) : null}

        {view === 'confirmationSent' ? (
          <Result
            status="success"
            title={t('auth.confirmationTitle')}
            subTitle={t('auth.confirmationSub', { email: confirmedEmail })}
            extra={
              <Button onClick={onResend} loading={resendState === 'sending'} disabled={resendState === 'sent'}>
                {resendState === 'sent' ? t('auth.confirmationResent') : t('auth.resendConfirmation')}
              </Button>
            }
          />
        ) : view === 'forgotPassword' ? (
          <>
            {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}
            <Form layout="vertical" onFinish={onRequestReset}>
              <Form.Item label={t('auth.email')}>
                <Input
                  aria-label={t('auth.email')}
                  prefix={<MailOutlined />}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  autoComplete="email"
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                {t('auth.sendResetLink')}
              </Button>
              <Button type="link" block onClick={() => setView('form')}>
                {t('auth.backToLogin')}
              </Button>
            </Form>
          </>
        ) : view === 'resetPassword' ? (
          <>
            {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}
            <Form layout="vertical" onFinish={onResetPassword}>
              <Form.Item label={t('auth.newPassword')}>
                <Input.Password
                  aria-label={t('auth.newPassword')}
                  prefix={<LockOutlined />}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.currentTarget.value)}
                  autoComplete="new-password"
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                {t('auth.resetPassword')}
              </Button>
            </Form>
          </>
        ) : (
          <>
            <Segmented
              block
              value={mode}
              onChange={(value) => {
                setMode(value as Mode);
                setError(null);
              }}
              options={[
                { label: t('auth.login'), value: 'login' },
                { label: t('auth.signup'), value: 'signup' }
              ]}
              style={{ marginBottom: 16 }}
            />

            {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}

            <Form layout="vertical" onFinish={onSubmit}>
              <Form.Item label={t('auth.email')}>
                <Input
                  aria-label={t('auth.email')}
                  prefix={<MailOutlined />}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  autoComplete="email"
                />
              </Form.Item>
              <Form.Item label={t('auth.password')}>
                <Input.Password
                  aria-label={t('auth.password')}
                  prefix={<LockOutlined />}
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                {mode === 'login' ? t('auth.loginButton') : t('auth.createAccount')}
              </Button>
              {mode === 'login' ? (
                <Button type="link" block onClick={() => setView('forgotPassword')}>
                  {t('auth.forgotPassword')}
                </Button>
              ) : null}
            </Form>

            <Divider>{t('common.or')}</Divider>

            <Button block icon={<GoogleOutlined />} href={GOOGLE_SIGN_IN_URL}>
              {mode === 'login' ? t('auth.signInWithGoogle') : t('auth.signUpWithGoogle')}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
