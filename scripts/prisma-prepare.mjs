// Pick the right Prisma schema for `prisma generate` based on DATABASE_URL, so
// the SAME build command works locally (SQLite) and in production (Postgres).
//   - DATABASE_URL starts with postgres:// or postgresql:// -> generate the
//     PostgreSQL client from the generated prod schema.
//   - otherwise -> generate from the default SQLite schema.
// Used by the `build` script (see package.json).

import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL || "";
const isPostgres = /^postgres(ql)?:\/\//i.test(url);

function run(cmd) {
  console.log(`[prisma-prepare] ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

if (isPostgres) {
  run("node scripts/build-prisma-schema.mjs");
  run("npx --no-install prisma generate --schema prisma/schema.prod.prisma");
} else {
  run("npx --no-install prisma generate");
}
