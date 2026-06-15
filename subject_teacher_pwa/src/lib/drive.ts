// Thin Google Drive REST client scoped to the hidden appDataFolder.
//
// Only JSON read/write against appDataFolder is needed. The teacher's
// settings/timetable/students/attendance files live here and are shared with
// the desktop Python app, which uses the same file names and camelCase JSON.

import { getValidAccessToken } from "./auth";

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

export class DriveError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Drive API ${status}: ${detail}`);
    this.name = "DriveError";
  }

  /** Token expired / revoked — caller should re-authenticate. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  return { Authorization: `Bearer ${token}`, ...(extra ?? {}) };
}

async function ensureOk(response: Response): Promise<Response> {
  if (!response.ok) {
    throw new DriveError(response.status, await response.text());
  }
  return response;
}

/** Find a file in appDataFolder by exact name. Returns its id or null. */
export async function findFileId(name: string): Promise<string | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${name.replace(/'/g, "\\'")}'`,
    fields: "files(id,name,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: "1",
  });
  const response = await ensureOk(
    await fetch(`${FILES_URL}?${params.toString()}`, { headers: await authHeaders() }),
  );
  const data = (await response.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}

/** Read and parse a JSON file from appDataFolder. Returns null if absent. */
export async function readJson<T = unknown>(name: string): Promise<{ id: string; data: T } | null> {
  const id = await findFileId(name);
  if (!id) return null;
  const response = await ensureOk(
    await fetch(`${FILES_URL}/${id}?alt=media`, { headers: await authHeaders() }),
  );
  return { id, data: (await response.json()) as T };
}

/**
 * Write a JSON file to appDataFolder. Updates `existingId` when given,
 * otherwise creates a new file. Returns the file id.
 */
export async function writeJson(
  name: string,
  data: unknown,
  existingId?: string | null,
): Promise<string> {
  const body = JSON.stringify(data);

  if (existingId) {
    const response = await ensureOk(
      await fetch(`${UPLOAD_URL}/${existingId}?uploadType=media&fields=id`, {
        method: "PATCH",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body,
      }),
    );
    const json = (await response.json()) as { id: string };
    return json.id;
  }

  const boundary = `neis-${Math.random().toString(36).slice(2)}`;
  const metadata = { name, parents: ["appDataFolder"] };
  const multipart =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${body}\r\n` +
    `--${boundary}--`;

  const response = await ensureOk(
    await fetch(`${UPLOAD_URL}?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: await authHeaders({ "Content-Type": `multipart/related; boundary=${boundary}` }),
      body: multipart,
    }),
  );
  const json = (await response.json()) as { id: string };
  return json.id;
}
