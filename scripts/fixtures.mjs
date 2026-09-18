/**
 * Fixture account used to generate the README screenshots.
 *
 * These responses mirror the shape of the LaunchDarkly endpoints the dashboard
 * reads, so the screenshots exercise the real components and the real scan,
 * without pointing docs tooling at somebody's production account.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function buildFixtures(now) {
  const projects = {
    items: [
      {
        key: 'payments',
        name: 'Payments',
        environments: {
          items: [
            { key: 'production', name: 'Production' },
            { key: 'staging', name: 'Staging' },
          ],
        },
      },
      {
        key: 'web',
        name: 'Web app',
        environments: { items: [{ key: 'production', name: 'Production' }] },
      },
    ],
    totalCount: 2,
  };

  const flagsByProject = {
    payments: {
      items: [
        { key: 'checkout-v2', name: 'Checkout v2' },
        { key: 'apple-pay', name: 'Apple Pay' },
        { key: 'fraud-model', name: 'Fraud model v3' },
      ],
      totalCount: 3,
    },
    web: {
      items: [
        { key: 'new-nav', name: 'New navigation' },
        { key: 'dark-mode', name: 'Dark mode' },
      ],
      totalCount: 2,
    },
  };

  const scheduledChanges = {
    'payments/checkout-v2/production': [
      {
        _id: 'sc1',
        _creationDate: now - DAY,
        _version: 1,
        executionDate: now + 3 * HOUR,
        instructions: [{ kind: 'turnFlagOn' }],
      },
      {
        _id: 'sc2',
        _creationDate: now - DAY,
        _version: 1,
        executionDate: now + 2 * DAY,
        instructions: [
          { kind: 'updateFallthroughVariationOrRollout', rolloutWeights: { a: 25000, b: 75000 } },
        ],
      },
    ],
    'payments/apple-pay/staging': [
      {
        _id: 'sc3',
        _creationDate: now - 2 * DAY,
        _version: 1,
        executionDate: now + 5 * DAY,
        instructions: [
          { kind: 'addTargets', values: ['user-1', 'user-2', 'user-3'] },
          { kind: 'addTags', values: ['beta'] },
        ],
      },
    ],
    'payments/fraud-model/production': [
      {
        _id: 'sc4',
        _creationDate: now - 3 * DAY,
        _version: 1,
        executionDate: now - 2 * HOUR,
        instructions: [{ kind: 'turnFlagOff' }],
        conflicts: [{ reason: 'a later scheduled change turns this flag back on' }],
      },
    ],
    'web/new-nav/production': [
      {
        _id: 'sc5',
        _creationDate: now - DAY,
        _version: 1,
        executionDate: now + DAY + HOUR,
        instructions: [
          { kind: 'addRule', clauses: [{}, {}], rolloutWeights: { a: 10000, b: 90000 } },
        ],
      },
      {
        _id: 'sc6',
        _creationDate: now - DAY,
        _version: 1,
        executionDate: now + 9 * DAY,
        instructions: [{ kind: 'removeRule' }],
      },
    ],
    'web/dark-mode/production': [
      {
        _id: 'sc7',
        _creationDate: now - DAY,
        _version: 1,
        executionDate: now + 25 * DAY,
        instructions: [{ kind: 'archiveFlag' }],
      },
    ],
  };

  const approvalRequests = {
    items: [
      {
        _id: 'ar1',
        creationDate: now - HOUR,
        executionDate: now + 2 * DAY + HOUR,
        status: 'pending',
        reviewStatus: 'pending',
        resourceId: 'proj/payments:env/production:flag/apple-pay',
        instructions: [{ kind: 'turnFlagOn' }],
        project: { key: 'payments', name: 'Payments' },
        flag: { key: 'apple-pay', name: 'Apple Pay' },
        environments: [{ key: 'production', name: 'Production' }],
        description: 'Enable Apple Pay for the EU launch',
      },
      {
        _id: 'ar2',
        creationDate: now - 2 * DAY,
        executionDate: now + 4 * DAY,
        status: 'scheduled',
        reviewStatus: 'approved',
        resourceId: 'proj/web:env/production:flag/dark-mode',
        instructions: [
          { kind: 'updateFallthroughVariationOrRollout', rolloutWeights: { a: 50000, b: 50000 } },
        ],
        project: { key: 'web', name: 'Web app' },
        flag: { key: 'dark-mode', name: 'Dark mode' },
        environments: [{ key: 'production', name: 'Production' }],
      },
      {
        _id: 'ar3',
        creationDate: now - 4 * DAY,
        executionDate: now + 6 * DAY,
        status: 'pending',
        reviewStatus: 'pending',
        resourceId: 'proj/payments:env/staging:flag/fraud-model',
        instructions: [{ kind: 'replaceRules', rules: [{}, {}, {}] }],
        project: { key: 'payments', name: 'Payments' },
        flag: { key: 'fraud-model', name: 'Fraud model v3' },
        environments: [{ key: 'staging', name: 'Staging' }],
      },
    ],
    totalCount: 3,
  };

  return { projects, flagsByProject, scheduledChanges, approvalRequests };
}

export const IDENTITY = {
  authenticated: true,
  instance: 'us',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
};
