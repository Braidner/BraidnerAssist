import bcrypt from "bcryptjs";
import type { AppUser } from "@prisma/client";
import { prisma } from "../db/client.js";

export type UserRole = "admin" | "media";

export interface PublicUser {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ROLES = new Set<UserRole>(["admin", "media"]);

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && ROLES.has(value as UserRole);
}

export function toPublicUser(user: AppUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: isUserRole(user.role) ? user.role : "media",
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function hasUsers(): Promise<boolean> {
  return (await prisma.appUser.count()) > 0;
}

export async function verifyUserCredentials(username: string, password: string) {
  const user = await prisma.appUser.findUnique({ where: { username } });
  if (!user || !user.active) return null;

  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function getActiveUser(id: string) {
  return prisma.appUser.findFirst({
    where: { id, active: true },
  });
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await prisma.appUser.findMany({
    orderBy: [{ role: "asc" }, { username: "asc" }],
  });
  return users.map(toPublicUser);
}

export async function createFirstAdmin(input: {
  username: string;
  password: string;
  displayName?: string | null;
}): Promise<PublicUser> {
  if (await hasUsers()) throw new Error("setup already completed");
  return createUser({
    username: input.username,
    password: input.password,
    displayName: input.displayName?.trim() || "Admin",
    role: "admin",
  });
}

export async function createUser(input: {
  username: string;
  password: string;
  displayName?: string | null;
  role: UserRole;
}): Promise<PublicUser> {
  const username = input.username.trim();
  if (!username) throw new Error("username required");
  if (input.password.length < 6) throw new Error("password must be at least 6 chars");

  const user = await prisma.appUser.create({
    data: {
      username,
      displayName: input.displayName?.trim() || null,
      passwordHash: await bcrypt.hash(input.password, 10),
      role: input.role,
      active: true,
    },
  });
  return toPublicUser(user);
}

export async function updateUser(
  id: string,
  input: {
    displayName?: string | null;
    role?: UserRole;
    active?: boolean;
    password?: string;
  },
): Promise<PublicUser> {
  const current = await prisma.appUser.findUnique({ where: { id } });
  if (!current) throw new Error("user not found");

  const nextRole = input.role ?? (current.role as UserRole);
  const nextActive = input.active ?? current.active;
  await assertKeepsActiveAdmin(current.id, nextRole, nextActive);

  const user = await prisma.appUser.update({
    where: { id },
    data: {
      ...(input.displayName !== undefined
        ? { displayName: input.displayName?.trim() || null }
        : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.password
        ? { passwordHash: await bcrypt.hash(assertPassword(input.password), 10) }
        : {}),
    },
  });
  return toPublicUser(user);
}

export async function deleteUser(id: string): Promise<void> {
  const current = await prisma.appUser.findUnique({ where: { id } });
  if (!current) throw new Error("user not found");
  await assertKeepsActiveAdmin(current.id, "media", false);
  await prisma.appUser.delete({ where: { id } });
}

function assertPassword(password: string): string {
  if (password.length < 6) throw new Error("password must be at least 6 chars");
  return password;
}

async function assertKeepsActiveAdmin(
  changedUserId: string,
  nextRole: UserRole,
  nextActive: boolean,
): Promise<void> {
  const admins = await prisma.appUser.findMany({
    where: { role: "admin", active: true },
    select: { id: true },
  });
  const activeAdminIds = new Set(admins.map((user) => user.id));
  if (nextRole === "admin" && nextActive) activeAdminIds.add(changedUserId);
  else activeAdminIds.delete(changedUserId);

  if (activeAdminIds.size === 0) {
    throw new Error("at least one active admin is required");
  }
}
