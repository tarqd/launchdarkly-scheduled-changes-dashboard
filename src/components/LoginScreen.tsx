import {
  Alert,
  AlertText,
  Button,
  Form,
  Heading,
  Input,
  Label,
  Link,
  LinkButton,
  Separator,
  Text,
  TextField,
} from '@launchpad-ui/components';
import { Icon } from '@launchpad-ui/icons';
import { type FormEvent, useState } from 'react';
import { loginUrl, loginWithToken } from '../api/client';
import type { AuthMethods } from '../api/types';

const AUTH_ERRORS: Record<string, string> = {
  access_denied: 'You declined the authorization request.',
  state_mismatch: 'The sign-in request could not be verified. Please try again.',
  state_expired: 'The sign-in request expired. Please try again.',
  missing_code: 'LaunchDarkly did not return an authorization code.',
  token_exchange_failed: 'LaunchDarkly rejected the authorization code.',
  invalid_token_response: 'LaunchDarkly returned an unexpected token response.',
};

export interface LoginScreenProps {
  authError?: string | null;
  /** Which methods this deployment is configured for. */
  methods: AuthMethods;
}

/**
 * Signing in with an access token, for when OAuth is not an option: registering
 * an OAuth client needs admin access, and there is no client at all when
 * somebody is running this locally against an account they do not administer.
 */
function TokenForm({ standalone }: { standalone: boolean }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await loginWithToken(token.trim());
      // The session cookie is set; reload so the app picks it up and the token
      // never lives in component state longer than it has to.
      setToken('');
      window.location.replace('/');
    } catch (cause) {
      setError((cause as Error).message);
      setIsSubmitting(false);
    }
  }

  return (
    <Form onSubmit={onSubmit} className="stack login__token-form">
      <TextField
        value={token}
        onChange={setToken}
        type="password"
        autoComplete="off"
        isRequired
        isDisabled={isSubmitting}
      >
        <Label>Access token</Label>
        <Input placeholder="api-..." />
      </TextField>

      {error ? (
        <Alert status="error">
          <AlertText>
            <Text size="small">{error}</Text>
          </AlertText>
        </Alert>
      ) : null}

      <Button type="submit" variant={standalone ? 'primary' : 'default'} isDisabled={isSubmitting}>
        {isSubmitting ? 'Checking token…' : 'Sign in with a token'}
      </Button>

      <Text size="small">
        A read-only token is enough. Create one under{' '}
        <Link
          href="https://app.launchdarkly.com/settings/authorization"
          target="_blank"
          rel="noreferrer"
        >
          Account settings &rarr; Authorization
        </Link>
        .
      </Text>
    </Form>
  );
}

export function LoginScreen({ authError, methods }: LoginScreenProps) {
  const [showTokenForm, setShowTokenForm] = useState(false);

  return (
    <main className="login">
      <div className="card login__card">
        <div className="row">
          <Icon name="calendar-schedule" size="large" aria-hidden="true" />
          <Heading size="medium" level={1}>
            Scheduled changes
          </Heading>
        </div>

        <Text>
          One place to see every scheduled flag change and future-dated approval request across your
          LaunchDarkly account.
        </Text>

        <ul className="login__points">
          <li>
            <Text size="small" elementType="span">
              Every project and environment on one timeline
            </Text>
          </li>
          <li>
            <Text size="small" elementType="span">
              Instructions written out in plain language
            </Text>
          </li>
          <li>
            <Text size="small" elementType="span">
              Conflicts and pending approvals called out up front
            </Text>
          </li>
        </ul>

        {authError ? (
          <Alert status="error">
            <AlertText>
              <Heading size="small" level={2}>
                Sign-in failed
              </Heading>
              <Text size="small">{AUTH_ERRORS[authError] ?? authError}</Text>
            </AlertText>
          </Alert>
        ) : null}

        {methods.oauth ? (
          <>
            <LinkButton variant="primary" href={loginUrl('/')}>
              Sign in with LaunchDarkly
            </LinkButton>

            <Text size="small">
              The app requests the <code>reader</code> scope and never writes to your account.
            </Text>

            {methods.token ? (
              <>
                <Separator />
                <Button
                  className="login__toggle"
                  variant="minimal"
                  onPress={() => setShowTokenForm((shown) => !shown)}
                  aria-expanded={showTokenForm}
                  aria-controls="token-form"
                >
                  <Icon
                    name={showTokenForm ? 'chevron-down' : 'chevron-right'}
                    size="small"
                    aria-hidden="true"
                  />
                  Use an access token instead
                </Button>
                {showTokenForm ? (
                  <div id="token-form">
                    <TokenForm standalone={false} />
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            <Text size="small">
              This deployment has no OAuth client configured, so sign in with a LaunchDarkly access
              token. Everything the app does is read-only.
            </Text>
            <TokenForm standalone />
          </>
        )}
      </div>
    </main>
  );
}
