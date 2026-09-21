/*
 * 팀 공용 로그인 계정(아이디/비밀번호) 저장소.
 * server/data/auth.json 파일 하나에 사용자 이름 + 비밀번호 해시(salt 포함)만 저장합니다.
 * 비밀번호는 원문으로 저장하지 않고 Node 기본 crypto.scrypt로 해시해서 저장합니다.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

function hashPassword(password, existingSalt) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const check = crypto.scryptSync(String(password), salt, 64);
    const stored = Buffer.from(hash, 'hex');
    if (check.length !== stored.length) return false;
    return crypto.timingSafeEqual(check, stored);
  } catch (e) {
    return false;
  }
}

function writeAuth(auth) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth), 'utf8');
}

// 처음 실행 시 계정이 없으면 기본 계정을 만들어줍니다.
// 환경변수 TEAM_USERNAME / TEAM_PASSWORD로 초기값을 지정할 수 있습니다.
function readOrCreateAuth() {
  if (fs.existsSync(AUTH_FILE)) {
    try { return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); }
    catch (e) { /* fall through to recreate */ }
  }
  const username = process.env.TEAM_USERNAME || 'ehsteam';
  const password = process.env.TEAM_PASSWORD || 'changeme123';
  const { salt, hash } = hashPassword(password);
  const auth = { username, salt, hash };
  writeAuth(auth);
  console.log('====================================================');
  console.log('초기 로그인 계정이 생성되었습니다. (server/data/auth.json)');
  console.log('아이디:', username);
  console.log('비밀번호:', password);
  console.log('보안을 위해 최초 접속 후 비밀번호를 변경해주세요.');
  console.log('변경 방법: server 폴더에서  node set-password.js <새아이디> <새비밀번호>');
  console.log('====================================================');
  return auth;
}

function setCredentials(username, password) {
  const { salt, hash } = hashPassword(password);
  const auth = { username, salt, hash };
  writeAuth(auth);
  return auth;
}

function checkCredentials(username, password) {
  const auth = readOrCreateAuth();
  if (username !== auth.username) return false;
  return verifyPassword(password, auth.salt, auth.hash);
}

module.exports = { readOrCreateAuth, setCredentials, checkCredentials, AUTH_FILE };
