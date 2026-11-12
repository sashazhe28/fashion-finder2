import { clerkClient } from "@clerk/express";

export type ClerkUser = Awaited<ReturnType<typeof clerkClient.users.getUser>>;

export const userLockKey = (userId: string) => `user:${userId}`;

export function getUser(userId: string): Promise<ClerkUser> {
  return clerkClient.users.getUser(userId);
}

export function primaryEmail(user: ClerkUser): string | null {
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  return (primary ?? user.emailAddresses[0])?.emailAddress ?? null;
}

/**
 * Metadata layout in Clerk:
 *  publicMetadata.pro_until          ISO date, end of PRO (readable by the frontend, writable only by the server)
 *  privateMetadata.free_searches_used number of free searches used by a registered user
 *  privateMetadata.pro_payments       ids of applied payments (protection from double extension)
 *
 * Call these only inside withLock(userLockKey(userId)).
 */
export async function patchMetadata(
  userId: string,
  patch: { publicMetadata?: Record<string, unknown>; privateMetadata?: Record<string, unknown> },
): Promise<ClerkUser> {
  return clerkClient.users.updateUserMetadata(userId, patch);
}
