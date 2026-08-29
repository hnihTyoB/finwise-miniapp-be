require('dotenv').config();
const { spawn } = require('child_process');

if (!process.env.DATABASE_URL) {
  const password = encodeURIComponent(process.env.DB_PASSWORD || '');
  const user = encodeURIComponent(process.env.DB_USER || 'postgres');
  process.env.DATABASE_URL = `postgresql://${user}:${password}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'datacrawler'}?schema=public`;
}

const args = process.argv.slice(2);
const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(cmd, ['prisma', ...args], {
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 1));
