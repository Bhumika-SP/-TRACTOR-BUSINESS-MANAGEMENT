import bcrypt from 'bcryptjs';
import { User, type Role, type UserDoc } from '../models';
import { badRequest, conflict, notFound, unauthorized } from '../utils/errors';
import { audit, isDuplicateKeyError } from '../utils/tx';

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function serializeUser(u: UserDoc) {
  return {
    id: String(u._id),
    name: u.name,
    username: u.username,
    role: u.role,
    canEdit: u.role === 'admin' || (u.role === 'entry' && Boolean(u.canEdit)),
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

// Compared against when the username does not exist, so login takes the same time either way.
let dummyHash: Promise<string> | null = null;

export async function login(username: string, password: string): Promise<UserDoc> {
  const user = await User.findOne({ username: username.toLowerCase() });
  dummyHash ??= bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS);
  const valid = await bcrypt.compare(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !valid || !user.isActive) throw unauthorized('Wrong username or password');
  return user;
}

export async function createUser(
  input: { name: string; username: string; password: string; role: Role; canEdit: boolean },
  actorId: string,
) {
  try {
    const user = await User.create({
      name: input.name,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      canEdit: input.role === 'entry' ? input.canEdit : input.role === 'admin',
    });
    await audit(null, { entityType: 'User', entityId: user._id, action: 'create', after: serializeUser(user), userId: actorId });
    return user;
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict('This username is already taken');
    throw err;
  }
}

export async function updateUser(
  id: string,
  input: Partial<{ name: string; role: Role; canEdit: boolean; isActive: boolean; password: string }>,
  actorId: string,
) {
  const user = await User.findById(id);
  if (!user) throw notFound('User');
  const before = serializeUser(user);
  const losingAdmin =
    user.role === 'admin' && ((input.role && input.role !== 'admin') || input.isActive === false);
  if (losingAdmin) {
    if (id === actorId) throw badRequest('You cannot remove your own admin access');
    const otherAdmins = await User.countDocuments({ _id: { $ne: user._id }, role: 'admin', isActive: true });
    if (otherAdmins === 0) throw badRequest('At least one active admin is required');
  }
  if (input.name !== undefined) user.name = input.name;
  if (input.role !== undefined) user.role = input.role;
  if (input.canEdit !== undefined) user.canEdit = input.canEdit;
  if (input.isActive !== undefined) user.isActive = input.isActive;
  if (input.password) user.passwordHash = await hashPassword(input.password);
  // Password change, deactivation or role change signs the user out everywhere.
  if (input.password || input.isActive === false || (input.role && input.role !== before.role)) {
    user.tokenVersion += 1;
  }
  await user.save();
  await audit(null, { entityType: 'User', entityId: user._id, action: 'update', before, after: serializeUser(user), userId: actorId });
  return user;
}

export async function logoutEverywhere(id: string) {
  await User.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } });
}
