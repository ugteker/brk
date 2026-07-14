const { spawnSync } = require('node:child_process');

const result =
  process.platform === 'win32'
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'prisma generate'], { encoding: 'utf8' })
    : spawnSync('./node_modules/.bin/prisma', ['generate'], { encoding: 'utf8' });

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}

if (result.status === 0) {
  process.exit(0);
}

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const windowsEngineLock =
  process.platform === 'win32' &&
  /EPERM:\s*operation not permitted,\s*rename .*query_engine-windows\.dll\.node\.tmp/i.test(output);

if (windowsEngineLock) {
  process.stderr.write(
    '\n[prisma-generate-safe] Prisma client is locked by another running Node process.\n' +
      '[prisma-generate-safe] Continuing startup with the currently generated client.\n'
  );
  process.exit(0);
}

process.exit(result.status ?? 1);
