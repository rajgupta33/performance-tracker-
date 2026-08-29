import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { vu } from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';

const APPROVAL = 'STAGING_LOAD_TEST_APPROVED';
const WRITE_APPROVAL = 'CREATE_TAGGED_STAGING_LEADS';
const profileName = (__ENV.PROFILE || 'load').toLowerCase();
const accountsFile = __ENV.ACCOUNTS_FILE || './accounts.json';
const baseUrl = (__ENV.SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = __ENV.SUPABASE_PUBLISHABLE_KEY || '';
const stagingProjectRef = (__ENV.STAGING_PROJECT_REF || '').trim().toLowerCase();
const productionProjectRef = (__ENV.PRODUCTION_PROJECT_REF || '').trim().toLowerCase();
const writeMode = (__ENV.WRITE_MODE || 'false').toLowerCase() === 'true';

const profiles = {
  smoke: {
    maxVUs: 2,
    stages: [
      { duration: '20s', target: 2 },
      { duration: '40s', target: 2 },
      { duration: '10s', target: 0 },
    ],
  },
  load: {
    maxVUs: 200,
    stages: [
      { duration: '2m', target: 50 },
      { duration: '5m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '5m', target: 100 },
      { duration: '2m', target: 200 },
      { duration: '5m', target: 200 },
      { duration: '2m', target: 0 },
    ],
  },
};

if (!profiles[profileName]) fail(`PROFILE must be one of: ${Object.keys(profiles).join(', ')}`);

const accounts = new SharedArray('staging load-test accounts', () => {
  const parsed = JSON.parse(open(accountsFile));
  if (!Array.isArray(parsed)) fail('ACCOUNTS_FILE must contain a JSON array');
  return parsed;
});

const authFailures = new Counter('auth_failures');
const businessFailures = new Counter('business_failures');
const businessSuccess = new Rate('business_success');

export const options = {
  scenarios: {
    fieldforce: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: profiles[profileName].stages,
      gracefulRampDown: '30s',
      tags: { workload: 'fieldforce', profile: profileName },
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '1m' }],
    http_req_duration: ['p(95)<1200', 'p(99)<2500'],
    'http_req_duration{name:customers_list}': ['p(95)<900'],
    'http_req_duration{name:visits_list}': ['p(95)<1200'],
    'http_req_duration{name:leads_list}': ['p(95)<1200'],
    'http_req_duration{name:points_summary}': ['p(95)<1000'],
    business_success: ['rate>0.99'],
    auth_failures: ['count<1'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  userAgent: 'Vardhnam-Fieldforce-Staging-Load-Test/1.0',
};

let accessToken;
let createdTaggedLead = false;

function validateTarget() {
  if (__ENV.LOAD_TEST_CONFIRMATION !== APPROVAL) {
    fail(`Set LOAD_TEST_CONFIRMATION=${APPROVAL}`);
  }
  if (!baseUrl || !publishableKey || !stagingProjectRef || !productionProjectRef) {
    fail('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, STAGING_PROJECT_REF, and PRODUCTION_PROJECT_REF are required');
  }

  const expectedHost = `${stagingProjectRef}.supabase.co`;
  const actualHost = baseUrl.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
  if (actualHost !== expectedHost) {
    fail(`SUPABASE_URL host must exactly match the declared staging ref (${expectedHost})`);
  }
  if (productionProjectRef && stagingProjectRef === productionProjectRef) {
    fail('Refusing to run: STAGING_PROJECT_REF matches PRODUCTION_PROJECT_REF');
  }
  if (writeMode && __ENV.WRITE_CONFIRMATION !== WRITE_APPROVAL) {
    fail(`WRITE_MODE requires WRITE_CONFIRMATION=${WRITE_APPROVAL}`);
  }
}

export function setup() {
  validateTarget();
  const required = profiles[profileName].maxVUs;
  if (accounts.length < required) {
    fail(`${profileName} profile requires ${required} unique accounts; found ${accounts.length}`);
  }
  const seenEmails = {};
  for (let index = 0; index < accounts.length; index += 1) {
    const account = accounts[index];
    if (!account.email || !account.password || account.email.endsWith('.invalid')) {
      fail(`Account ${index + 1} is missing real staging credentials`);
    }
    const normalizedEmail = account.email.trim().toLowerCase();
    if (seenEmails[normalizedEmail]) fail(`Duplicate staging account: ${normalizedEmail}`);
    seenEmails[normalizedEmail] = true;
  }
  authFailures.add(0);
  return { profile: profileName, writeMode };
}

function headers(token, prefer) {
  const result = {
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (prefer) result.Prefer = prefer;
  return result;
}

function authenticate(account) {
  const response = http.post(
    `${baseUrl}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: account.email, password: account.password }),
    { headers: { apikey: publishableKey, 'Content-Type': 'application/json' }, tags: { name: 'auth_password' } },
  );
  const ok = check(response, { 'authentication succeeds': (r) => r.status === 200 && Boolean(r.json('access_token')) });
  if (!ok) {
    authFailures.add(1);
    return null;
  }
  return response.json('access_token');
}

function record(response, label) {
  const ok = check(response, { [`${label} succeeds`]: (r) => r.status >= 200 && r.status < 300 });
  businessSuccess.add(ok);
  if (!ok) businessFailures.add(1, { operation: label });
  if (response.status === 401) accessToken = null;
}

function get(path, name) {
  const response = http.get(`${baseUrl}/rest/v1/${path}`, {
    headers: headers(accessToken),
    tags: { name },
  });
  record(response, name);
}

function rpc(rpcName, body = {}, metricName = rpcName) {
  const response = http.post(`${baseUrl}/rest/v1/rpc/${rpcName}`, JSON.stringify(body), {
    headers: headers(accessToken),
    tags: { name: metricName },
  });
  record(response, metricName);
  return response;
}

function randomUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : ((value & 0x3) | 0x8)).toString(16);
  });
}

function createTaggedLead() {
  const stamp = `${Date.now()}-${vu.idInTest}`;
  const response = rpc('create_crm_lead', {
    p_lead_id: randomUuid(),
    p_client_event_id: randomUuid(),
    p_customer_id: null,
    p_prospect_name: `K6-PERF-${stamp}`,
    p_contact_name: 'Synthetic load test',
    p_mobile: null,
    p_source: 'OTHER',
    p_estimated_value: 0,
    p_products: ['LOAD_TEST'],
    p_follow_up_at: new Date(Date.now() + 86400000).toISOString(),
    p_follow_up_type: 'CALL',
    p_follow_up_note: 'Synthetic staging performance-test record',
  });
  if (response.status >= 200 && response.status < 300) createdTaggedLead = true;
}

export default function () {
  const account = accounts[vu.idInTest - 1];
  if (!account) fail(`No credential mapped to VU ${vu.idInTest}`);
  if (!accessToken) accessToken = authenticate(account);
  if (!accessToken) {
    sleep(2);
    return;
  }

  const choice = Math.random();
  if (choice < 0.35) {
    get('customers?select=id,name,customer_type,address,territory_id&active=eq.true&approval_status=eq.APPROVED&order=name.asc&limit=50', 'customers_list');
  } else if (choice < 0.60) {
    get('field_visits?select=id,status,location_status,customer_id,started_at,completed_at&order=started_at.desc&limit=50', 'visits_list');
  } else if (choice < 0.85) {
    get('crm_leads?select=id,stage,source,estimated_value,next_follow_up_at,updated&order=updated.desc&limit=50', 'leads_list');
  } else {
    rpc('get_my_points_summary', {}, 'points_summary');
  }

  // Mixed mode adds at most one auditable write per VU, not one per iteration.
  if (writeMode && !createdTaggedLead && Math.random() < 0.05) createTaggedLead();
  sleep(1 + Math.random() * 2);
}

export function handleSummary(data) {
  const path = __ENV.SUMMARY_PATH || `artifacts/performance/${profileName}-${Date.now()}.json`;
  return { [path]: JSON.stringify(data, null, 2) };
}
