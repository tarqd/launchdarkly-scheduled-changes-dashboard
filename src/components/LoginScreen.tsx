import { Alert, AlertText, Heading, LinkButton, Text } from '@launchpad-ui/components';
import { Icon } from '@launchpad-ui/icons';
import { loginUrl } from '../api/client';

const AUTH_ERRORS: Record<string, string> = {
  access_denied: 'You declined the authorization request.',
  state_mismatch: 'The sign-in request could not be verified. Please try again.',
  state_expired: 'The sign-in request expired. Please try again.',
  missing_code: 'LaunchDarkly did not return an authorization code.',
  token_exchange_failed: 'LaunchDarkly rejected the authorization code.',
  invalid_token_response: 'LaunchDarkly returned an unexpected token response.',
};

export function LoginScreen({ authError }: { authError?: string | null }) {
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

        <LinkButton variant="primary" href={loginUrl('/')}>
          Sign in with LaunchDarkly
        </LinkButton>

        <Text size="small">
          Read-only. The app requests the <code>reader</code> scope and never writes to your
          account; your access token stays on the server.
        </Text>
      </div>
    </main>
  );
}
