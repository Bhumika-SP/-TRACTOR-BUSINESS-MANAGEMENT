/**
 * Creates the first Admin account (users cannot sign themselves up).
 *
 *   npm run create-admin -- --name "Owner Name" --username owner --password "StrongPass123"
 *
 * Or set ADMIN_NAME / ADMIN_USERNAME / ADMIN_PASSWORD environment variables.
 * Uses MONGODB_URI from .env.
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';
import { User } from '../models';
import { getSettings } from '../services/settingsService';
import { hashPassword } from '../services/userService';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg('name') ?? process.env.ADMIN_NAME;
  const username = (arg('username') ?? process.env.ADMIN_USERNAME)?.trim().toLowerCase();
  const password = arg('password') ?? process.env.ADMIN_PASSWORD;
  if (!name || !username || !password) {
    throw new Error('Usage: npm run create-admin -- --name "Owner" --username owner --password "StrongPass123"');
  }
  if (password.length < 8) throw new Error('Admin password must be at least 8 characters');

  await connectDatabase(env().MONGODB_URI);
  const existing = await User.findOne({ username });
  if (existing) {
    console.log(`User "${username}" already exists (role: ${existing.role}). Nothing changed.`);
  } else {
    await User.create({ name, username, passwordHash: await hashPassword(password), role: 'admin', canEdit: true });
    console.log(`Admin "${username}" created. Log in from the app with this username and password.`);
  }
  await getSettings(); // make sure the settings document exists
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
