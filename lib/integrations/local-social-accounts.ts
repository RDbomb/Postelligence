import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SocialAccount } from "@/lib/integrations/social-accounts";

type StoredSocialAccount = SocialAccount & {
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
};

type SaveYouTubeAccountInput = {
  userId: string;
  accountId: string;
  accountName: string;
  accountAvatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
};

type SaveMetaAccountInput = {
  userId: string;
  platform: "facebook" | "instagram";
  accountId: string;
  accountName: string;
  accountAvatarUrl: string | null;
  accessToken: string;
  tokenExpiresAt: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
};

const dataDirectory = path.join(process.cwd(), ".postelligence-data");
const storePath = path.join(dataDirectory, "social-accounts.json");
const temporaryStorePath = path.join(dataDirectory, "social-accounts.tmp.json");

function getEncryptionKey() {
  const secret = process.env.YOUTUBE_CLIENT_SECRET || process.env.META_APP_SECRET;

  if (!secret) {
    throw new Error("An OAuth client secret is required for local token encryption.");
  }

  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string | null) {
  if (!value) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const [iv, authTag, encrypted] = value
      .split(".")
      .map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

async function readStore(): Promise<StoredSocialAccount[]> {
  try {
    return JSON.parse(await readFile(storePath, "utf8")) as StoredSocialAccount[];
  } catch {
    return [];
  }
}

async function writeStore(accounts: StoredSocialAccount[]) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(temporaryStorePath, JSON.stringify(accounts, null, 2), "utf8");
  await rename(temporaryStorePath, storePath);
}

export async function getLocalSocialAccounts(userId: string): Promise<SocialAccount[]> {
  const accounts = await readStore();

  return accounts
    .filter((account) => account.user_id === userId)
    .map((item) => {
      const { user_id, access_token, refresh_token, token_expires_at, ...account } = item;
      void user_id; void access_token; void refresh_token; void token_expires_at;
      return account;
    });
}

export async function getLocalSocialAccountsWithTokens(userId: string): Promise<SocialAccount[]> {
  const accounts = await readStore();

  return accounts
    .filter((account) => account.user_id === userId)
    .map((item) => {
      const { user_id, access_token, refresh_token, token_expires_at, ...account } = item;
      void user_id;
      return {
        ...account,
        access_token: decrypt(access_token),
        refresh_token: decrypt(refresh_token),
        token_expires_at,
      };
    });
}

export async function saveLocalYouTubeAccount(input: SaveYouTubeAccountInput) {
  const accounts = await readStore();
  const existingIndex = accounts.findIndex(
    (account) =>
      account.user_id === input.userId &&
      account.platform === "youtube" &&
      account.account_id === input.accountId
  );
  const existing = existingIndex >= 0 ? accounts[existingIndex] : null;
  const now = new Date().toISOString();

  const account: StoredSocialAccount = {
    id: existing?.id || randomUUID(),
    user_id: input.userId,
    platform: "youtube",
    account_id: input.accountId,
    account_name: input.accountName,
    account_avatar_url: input.accountAvatarUrl,
    access_token: encrypt(input.accessToken),
    refresh_token: encrypt(input.refreshToken || decrypt(existing?.refresh_token || null)),
    token_expires_at: input.tokenExpiresAt,
    scopes: input.scopes,
    status: "connected",
    metadata: input.metadata,
    connected_at: existing?.connected_at || now,
    updated_at: now
  };

  if (existingIndex >= 0) {
    accounts[existingIndex] = account;
  } else {
    accounts.push(account);
  }

  await writeStore(accounts);
}

export async function saveLocalMetaAccount(input: SaveMetaAccountInput) {
  const accounts = await readStore();
  const existingIndex = accounts.findIndex(
    (account) =>
      account.user_id === input.userId &&
      account.platform === input.platform &&
      account.account_id === input.accountId
  );
  const existing = existingIndex >= 0 ? accounts[existingIndex] : null;
  const now = new Date().toISOString();

  const account: StoredSocialAccount = {
    id: existing?.id || randomUUID(),
    user_id: input.userId,
    platform: input.platform,
    account_id: input.accountId,
    account_name: input.accountName,
    account_avatar_url: input.accountAvatarUrl,
    access_token: encrypt(input.accessToken),
    refresh_token: null,
    token_expires_at: input.tokenExpiresAt,
    scopes: input.scopes,
    status: "connected",
    metadata: input.metadata,
    connected_at: existing?.connected_at || now,
    updated_at: now
  };

  if (existingIndex >= 0) {
    accounts[existingIndex] = account;
  } else {
    accounts.push(account);
  }

  await writeStore(accounts);
}

export async function disconnectLocalYouTubeAccount(userId: string) {
  const accounts = await readStore();
  const updatedAt = new Date().toISOString();
  let changed = false;

  const updatedAccounts = accounts.map((account) => {
    if (
      account.user_id !== userId ||
      account.platform !== "youtube" ||
      account.status !== "connected"
    ) {
      return account;
    }

    changed = true;
    return {
      ...account,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      status: "disconnected",
      updated_at: updatedAt
    };
  });

  if (changed) {
    await writeStore(updatedAccounts);
  }
}

export async function disconnectLocalMetaAccounts(userId: string, platform?: "facebook" | "instagram") {
  const accounts = await readStore();
  const updatedAt = new Date().toISOString();
  let changed = false;
  const platforms = platform ? [platform] : ["facebook", "instagram"];

  const updatedAccounts = accounts.map((account) => {
    if (
      account.user_id !== userId ||
      !platforms.includes(account.platform) ||
      account.status !== "connected"
    ) {
      return account;
    }

    changed = true;
    return {
      ...account,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      status: "disconnected",
      updated_at: updatedAt
    };
  });

  if (changed) {
    await writeStore(updatedAccounts);
  }
}
