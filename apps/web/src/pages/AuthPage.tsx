import { useState } from 'react';
import { Alert, Button, Card, Divider, Form, Input, Segmented, Typography } from 'antd';
import { GoogleOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { GOOGLE_SIGN_IN_URL } from '../api/auth';

const { Title, Paragraph } = Typography;

type Mode = 'login' | 'signup';

export function AuthPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signup(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ marginBottom: 0 }}>
          Brokerino
        </Title>
        <Paragraph type="secondary">Sign in to manage your AI trading agents.</Paragraph>

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
        </Form>

        <Divider>or</Divider>

        <Button block icon={<GoogleOutlined />} href={GOOGLE_SIGN_IN_URL}>
          {mode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}
        </Button>
      </Card>
    </div>
  );
}
