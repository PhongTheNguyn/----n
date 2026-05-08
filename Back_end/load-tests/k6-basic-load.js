import http from 'k6/http';
import { check, sleep } from 'k6';

// Run example:
// k6 run -e BASE_URL=http://localhost:3000 load-tests/k6-basic-load.js
export const options = {
  stages: [
    { duration: '45s', target: 5 },
    { duration: '2m', target: 5 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<3000']
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PASSWORD = __ENV.LOAD_TEST_PASSWORD || '123456';
const TEST_USER_COUNT = Number(__ENV.TEST_USER_COUNT || 20);

function jsonHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { headers };
}

function buildEmail(prefix, index) {
  return `load_${prefix}_${index}@test.local`;
}

export function setup() {
  // Create a reusable account pool once per test run to avoid
  // generating thousands of users during long load tests.
  const runPrefix = Date.now();
  const users = [];

  for (let i = 0; i < TEST_USER_COUNT; i += 1) {
    const email = buildEmail(runPrefix, i);
    users.push(email);
    const registerPayload = JSON.stringify({
      fullName: `Load User ${i}`,
      email,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      gender: 'male',
      country: 'vn',
      age: 22,
      agreeTerms: true
    });

    const registerRes = http.post(
      `${BASE_URL}/api/auth/register`,
      registerPayload,
      jsonHeaders()
    );

    // 201: created, 400: already exists (safe for reruns with same data)
    check(registerRes, {
      'setup register ok': (r) => r.status === 201 || r.status === 400
    });
  }

  return { users };
}

export default function (data) {
  const users = data?.users || [];
  const email = users.length ? users[(__VU - 1) % users.length] : buildEmail('fallback', __VU - 1);

  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password: PASSWORD }),
    jsonHeaders()
  );

  const loginOk = check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'login has token': (r) => {
      try {
        return !!r.json('token');
      } catch (e) {
        return false;
      }
    }
  });

  if (!loginOk) {
    sleep(1);
    return;
  }

  const token = loginRes.json('token');

  // 3) Authenticated endpoints (common app traffic)
  const profileRes = http.get(
    `${BASE_URL}/api/user/profile`,
    jsonHeaders(token)
  );
  check(profileRes, { 'profile status 200': (r) => r.status === 200 });

  const turnRes = http.get(
    `${BASE_URL}/api/webrtc/turn-credentials`,
    jsonHeaders(token)
  );
  check(turnRes, { 'turn credentials status 200': (r) => r.status === 200 });

  sleep(1);
}
