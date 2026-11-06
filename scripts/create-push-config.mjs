// 실행 결과에는 비밀키를 출력하지 않고, 시스템 임시 폴더에만 저장한다.
import { createECDH, randomBytes } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [project, contact] = process.argv.slice(2)
if (!/^[a-z0-9-]{8,64}$/.test(project || '') || !/^(mailto:|https:\/\/)[^\r\n]+$/.test(contact || '')) {
  console.error('사용법: node scripts/create-push-config.mjs <Supabase 프로젝트 ref> <mailto:운영자이메일>')
  process.exit(1)
}
const pair = createECDH('prime256v1')
pair.generateKeys()
const config = {
  VAPID_PUBLIC_KEY: pair.getPublicKey().toString('base64url'),
  VAPID_PRIVATE_KEY: pair.getPrivateKey().toString('base64url'),
  VAPID_SUBJECT: contact,
  PUSH_HOOK_SECRET: randomBytes(32).toString('hex'),
}
const directory = await mkdtemp(join(tmpdir(), 'sup-push-'))
const envFile = join(directory, '.env')
await writeFile(envFile, Object.entries(config).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 })
const sql = (value) => `'${value.replace(/'/g, "''")}'`
let vaultSql = '-- Supabase SQL Editor에서 migrations-013.sql 다음 실행. 이 파일은 비밀키를 포함하므로 공유 저장소에 올리지 않는다.\n'
for (const [name, value] of Object.entries({
  sup_push_function_url: `https://${project}.supabase.co/functions/v1/sound-push`,
  sup_push_hook_secret: config.PUSH_HOOK_SECRET,
})) {
  vaultSql += `do $sup_push$\ndeclare secret_id uuid;\nbegin\n  select id into secret_id from vault.secrets where name = ${sql(name)};\n  if secret_id is null then\n    perform vault.create_secret(${sql(value)}, ${sql(name)});\n  else\n    perform vault.update_secret(secret_id, ${sql(value)});\n  end if;\nend;\n$sup_push$;\n\n`
}
const sqlFile = join(directory, 'vault.sql')
await writeFile(sqlFile, vaultSql, { mode: 0o600 })
console.log(JSON.stringify({ envFile, sqlFile }, null, 2))
