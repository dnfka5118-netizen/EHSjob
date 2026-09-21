/*
 * 로그인 아이디/비밀번호를 변경하는 도구입니다.
 * 사용법: server 폴더에서
 *   node set-password.js <새 아이디> <새 비밀번호>
 * 서버가 실행 중이어도 안전하게 실행할 수 있습니다(다음 로그인부터 새 값이 적용됩니다).
 */
const { setCredentials } = require('./lib/authStore');

const [, , username, password] = process.argv;

if (!username || !password) {
  console.log('사용법: node set-password.js <새 아이디> <새 비밀번호>');
  process.exit(1);
}

setCredentials(username, password);
console.log('로그인 계정이 변경되었습니다.');
console.log('아이디:', username);
console.log('비밀번호:', password);
console.log('다음 로그인부터 새 아이디/비밀번호로 접속하세요. 기존에 로그인해있던 팀원은 다시 로그인해야 합니다.');
