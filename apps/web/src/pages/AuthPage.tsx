import { useEffect, useState } from 'react';
import { Alert, Button, Divider, Form, Input, Segmented, Typography } from 'antd';
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

const BRAND_FEATURES = [
  'Multi-agent signal discussions',
  'Real-time audio playback',
  'Performance tracking per symbol'
];

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
    <div className="flex min-h-screen">
      {/* Brand panel — hidden on mobile */}
      <div
        className="ct-animate-fade hidden flex-col justify-between p-12 lg:flex lg:w-[45%]"
        style={{
          background: 'hsl(225, 28%, 8%)',
          borderRight: '1px solid hsl(225, 18%, 16%)'
        }}
      >
        <div>
          <Title level={2} style={{ color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
            ChatTrader
          </Title>
          <p style={{ color: 'hsl(220, 14%, 55%)', marginTop: 6, fontSize: 14 }}>
            AI-powered market discussions
          </p>
        </div>

        <div className="space-y-8">
          <div>
            <Title
              level={1}
              style={{
                color: '#fff',
                margin: 0,
                lineHeight: 1.1,
                fontSize: 'clamp(2rem, 3.5vw, 2.75rem)',
                letterSpacing: '-0.03em'
              }}
            >
              Markets move fast.<br />Stay ahead.
            </Title>
            <Paragraph style={{ color: 'hsl(220, 14%, 60%)', marginTop: 16, fontSize: 15, lineHeight: 1.6 }}>
              AI agents discuss, debate, and signal — so you can decide.
            </Paragraph>
          </div>

          <div className="space-y-3">
            {BRAND_FEATURES.map((feat) => (
              <div key={feat} className="flex items-center gap-3">
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#9d6fe8', flexShrink: 0 }} />
                <span style={{ color: 'hsl(220, 14%, 72%)', fontSize: 14 }}>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ color: 'hsl(220, 14%, 38%)', fontSize: 12 }}>© 2025 ChatTrader</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="ct-animate-enter w-full max-w-[380px]">
          {/* Mobile-only logo */}
          <Title level={3} className="lg:hidden" style={{ marginBottom: 24 }}>
            ChatTrader
          </Title>

          {infoBanner ? (
            <Alert
              type={infoBanner.type}
              message={infoBanner.message}
              showIcon
              closable
              onClose={() => setInfoBanner(null)}
              style={{ marginBottom: 20 }}
            />
          ) : null}

          {view === 'confirmationSent' ? (
            <div className="py-4 text-center space-y-3">
              <p className="text-3xl">📬</p>
              <p className="text-base font-semibold">{t('auth.confirmationTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('auth.confirmationSub', { email: confirmedEmail })}</p>
              <p className="text-xs text-muted-foreground/60">{t('auth.confirmationSpamHint')}</p>
              <Button onClick={onResend} loading={resendState === 'sending'} disabled={resendState === 'sent'} className="mt-2">
                {resendState === 'sent' ? t('auth.confirmationResent') : t('auth.resendConfirmation')}
              </Button>
            </div>
          ) : view === 'forgotPassword' ? (
            <>
              <Title level={4} style={{ marginBottom: 20 }}>{t('auth.forgotPassword')}</Title>
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
              <Title level={4} style={{ marginBottom: 20 }}>{t('auth.resetPassword')}</Title>
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
              <Title level={4} style={{ marginBottom: 20 }}>{t('auth.title')}</Title>

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
                style={{ marginBottom: 20 }}
              />

              {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}

              {mode === 'signup' && (
                <div className="mb-4 space-y-1.5 rounded-lg border border-[hsl(266,73%,58%,0.25)] bg-[hsl(266,73%,58%,0.07)] px-4 py-3">
                  {[t('auth.valueProp1'), t('auth.valueProp2'), t('auth.valueProp3')].map((prop) => (
                    <p key={prop} className="text-xs text-[#9d6fe8]">{prop}</p>
                  ))}
                </div>
              )}

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
        </div>
      </div>
    </div>
  );
}
