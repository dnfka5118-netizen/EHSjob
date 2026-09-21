/*
 * 삼영순화(주) EHS팀 업무관리 대시보드 - 사내 공용 서버
 * ---------------------------------------------------
 * 이 서버는 team_calendar_dashboard.html 이 저장하는 전체 데이터를
 * 한 곳(이 PC/서버의 data/state.json)에 모아 팀원 여러 명이 공유하도록 하고,
 * 아이디/비밀번호 로그인으로 접근을 보호합니다.
 *
 * 실행 방법: README.md 참고 (npm install 후 npm start)
 */
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { readOrCreateAuth, checkCredentials } = require('./lib/authStore');

const app = express();
const PORT = process.env.PORT || 4000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'ehs-team-dashboard-please-change-this-secret';

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DASHBOARD_FILE = path.join(__dirname, '..', 'team_calendar_dashboard.html');
const LOGIN_FILE = path.join(__dirname, 'public', 'login.html');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// 서버 시작 시 로그인 계정이 없으면 기본 계정을 만들고 콘솔에 안내를 출력합니다.
readOrCreateAuth();

function readStore() {
  if (!fs.existsSync(DATA_FILE)) {
    return { state: null, version: 0, updatedAt: null, updatedBy: null };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('data/state.json 을 읽는 중 오류:', e);
    return { state: null, version: 0, updatedAt: null, updatedBy: null };
  }
}

function writeStore(store) {
  // 손상 방지를 위해 임시파일에 먼저 쓰고 교체(원자적 저장)
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
  // 하루 1회, 날짜별 백업 파일도 남겨둠 (데이터 실수 삭제 대비)
  const todayKey = new Date().toISOString().slice(0, 10);
  const backupFile = path.join(BACKUP_DIR, `state_${todayKey}.json`);
  try { fs.writeFileSync(backupFile, JSON.stringify(store), 'utf8'); } catch (e) { /* ignore */ }
}

app.use(express.json({ limit: '15mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7일
    // 이 서버는 사내망에서 http로 접속하는 것을 기본으로 합니다.
    // https로 서비스한다면 아래 값을 true로 바꾸세요.
    secure: false,
  },
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  return res.redirect('/login');
}

app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/login', (req, res) => {
  if (req.session && req.session.loggedIn) return res.redirect('/');
  res.sendFile(LOGIN_FILE);
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
  }
  if (checkCredentials(username, password)) {
    req.session.loggedIn = true;
    req.session.username = username;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
});

app.post('/api/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => res.json({ ok: true }));
  } else {
    res.json({ ok: true });
  }
});

// 아래부터는 로그인해야 접근 가능합니다.
app.use(requireAuth);

// 대시보드 HTML 자체를 이 서버에서 바로 열람 가능하게 서빙
app.get('/', (req, res) => {
  res.sendFile(DASHBOARD_FILE);
});

// 전체 상태 조회
app.get('/api/state', (req, res) => {
  const store = readStore();
  res.json(store);
});

// 전체 상태 저장 (낙관적 동시성 제어: expectedVersion이 서버 버전과 다르면 409 반환)
app.put('/api/state', (req, res) => {
  const { state, expectedVersion, updatedBy } = req.body || {};
  if (!state || typeof state !== 'object') {
    return res.status(400).json({ error: 'state 필드가 필요합니다.' });
  }
  const store = readStore();
  const hasExisting = store.state !== null && store.version > 0;
  if (hasExisting && typeof expectedVersion === 'number' && expectedVersion !== store.version) {
    // 다른 팀원이 그 사이에 먼저 저장함 - 최신 상태를 그대로 돌려줘서
    // 클라이언트가 병합/재시도를 판단하게 함
    return res.status(409).json(store);
  }
  const newStore = {
    state,
    version: (store.version || 0) + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || req.session.username || '',
  };
  writeStore(newStore);
  res.json(newStore);
});

app.listen(PORT, () => {
  console.log(`EHS 팀 업무관리 대시보드 서버가 실행 중입니다.`);
  console.log(`같은 네트워크의 팀원들은 브라우저에서 http://<이 PC의 내부IP>:${PORT} 로 접속하면 됩니다.`);
  console.log(`이 PC에서 직접 확인: http://localhost:${PORT}`);
});
