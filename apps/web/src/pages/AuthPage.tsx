import { useEffect, useState } from 'react';
import { Alert, Button, Card, Divider, Form, Input, Result, Segmented, Typography } from 'antd';
import { GoogleOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
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

  // No client-side router exists in this app, so backend redirects (email confirmation, locked
  // account, password reset) communicate via query params on the base URL. Read them once on
  // mount, then strip them from the URL so a refresh doesn't re-trigger the banner/form.
  useEffect(() => {
    const { emailConfirmed, accountLocked, resetToken: token } = readQueryParams();

    if (token) {
      setResetToken(token);
      setView('resetPassword');
    } else if (emailConfirmed === '1') {
      setInfoBanner({ type: 'success', message: 'Your email has been confirmed. You can now log in.' });
    } else if (emailConfirmed === '0') {
      setInfoBanner({ type: 'error', message: 'That confirmation link is invalid or has expired. Please request a new one.' });
    } else if (accountLocked === '1') {
      setInfoBanner({ type: 'warning', message: 'This account has been locked. Contact an administrator for help.' });
    }

    if (emailConfirmed || accountLocked || token) {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

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
      setError(err instanceof Error ? err.message : 'Something went wrong');
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
      setInfoBanner({ type: 'success', message: 'If that email is registered, a reset link is on its way.' });
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
      setInfoBanner({ type: 'success', message: 'Your password has been reset. You can now log in.' });
      setView('form');
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ marginBottom: 0 }}>
          ChatTrader
        </Title>
        <Paragraph type="secondary">Sign in to manage your AI trading agents.</Paragraph>

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
            title="Check your email"
            subTitle={`We sent a confirmation link to ${confirmedEmail}. Click it to activate your account.`}
            extra={
              <Button onClick={onResend} loading={resendState === 'sending'} disabled={resendState === 'sent'}>
                {resendState === 'sent' ? 'Confirmation email resent' : 'Resend confirmation email'}
              </Button>
            }
          />
        ) : view === 'forgotPassword' ? (
          <>
            {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}
            <Form layout="vertical" onFinish={onRequestReset}>
              <Form.Item label="Email">
                <Input
                  aria-label="Email"
                  prefix={<MailOutlined />}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  autoComplete="email"
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                Send reset link
              </Button>
              <Button type="link" block onClick={() => setView('form')}>
                Back to log in
              </Button>
            </Form>
          </>
        ) : view === 'resetPassword' ? (
          <>
            {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}
            <Form layout="vertical" onFinish={onResetPassword}>
              <Form.Item label="New password">
                <Input.Password
                  aria-label="New password"
                  prefix={<LockOutlined />}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.currentTarget.value)}
                  autoComplete="new-password"
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                Reset password
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
                { label: 'Log in', value: 'login' },
                { label: 'Sign up', value: 'signup' }
              ]}
              style={{ marginBottom: 16 }}
            />

            {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}

            <Form layout="vertical" onFinish={onSubmit}>
              <Form.Item label="Email">
                <Input
                  aria-label="Email"
                  prefix={<MailOutlined />}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  autoComplete="email"
                />
              </Form.Item>
              <Form.Item label="Password">
                <Input.Password
                  aria-label="Password"
                  prefix={<LockOutlined />}
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                {mode === 'login' ? 'Log in' : 'Create account'}
              </Button>
              {mode === 'login' ? (
                <Button type="link" block onClick={() => setView('forgotPassword')}>
                  Forgot password?
                </Button>
              ) : null}
            </Form>

            <Divider>or</Divider>

            <Button block icon={<GoogleOutlined />} href={GOOGLE_SIGN_IN_URL}>
              {mode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
