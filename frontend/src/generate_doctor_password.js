// generate_doctor_passwords.js - 의사 계정 비밀번호 해시 생성
// 실행 방법: node generate_doctor_passwords.js

import bcrypt from 'bcrypt';

const passwords = {
  'doctor1@hospital.com': 'Doctor1234!',
  'doctor2@hospital.com': 'Doctor1234!',
  'doctor3@hospital.com': 'Doctor1234!'
};

async function generateHashes() {
  console.log('🔐 의사 계정 비밀번호 해시 생성 중...\n');
  
  for (const [email, password] of Object.entries(passwords)) {
    const hash = await bcrypt.hash(password, 10);
    console.log(`✅ ${email}`);
    console.log(`   비밀번호: ${password}`);
    console.log(`   해시: ${hash}`);
    console.log();
  }
  
  console.log('📝 위 해시 값을 add_role_column.sql의 INSERT 문에 복사하세요!');
}

generateHashes();