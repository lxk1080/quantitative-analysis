import "server-only";

import { randomUUID } from "node:crypto";
import { rawDb } from "@/db/client";
import { listCustomCollections as listLegacyCollections } from "@/server/custom-collections";
import type { CustomCollection } from "@/server/custom-collections";

type Row = {
  id: string;
  title: string;
  configJson: string;
  createdAt: string;
  updatedAt: string;
};
const select =
  "SELECT id,title,config_json AS configJson,created_at AS createdAt,updated_at AS updatedAt FROM user_custom_collections";
function fromRow(row: Row): CustomCollection {
  return {
    id: row.id,
    title: row.title,
    category: "custom",
    config: JSON.parse(row.configJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Legacy files belong to zerol. Files remain as a backup.
async function importLegacy() {
  if (rawDb.prepare("SELECT 1 FROM legacy_collection_import WHERE id=1").get())
    return;
  const legacy = await listLegacyCollections();
  rawDb.transaction(() => {
    if (
      rawDb.prepare("SELECT 1 FROM legacy_collection_import WHERE id=1").get()
    )
      return;
    const insert = rawDb.prepare(
      "INSERT OR IGNORE INTO user_custom_collections(username,id,title,config_json,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    );
    for (const item of legacy)
      insert.run(
        "zerol",
        item.id,
        item.title,
        JSON.stringify(item.config),
        item.createdAt,
        item.updatedAt,
      );
    rawDb
      .prepare(
        "INSERT INTO legacy_collection_import(id,username,imported_at) VALUES (1,?,?)",
      )
      .run("zerol", new Date().toISOString());
  })();
}

export async function listUserCollections(
  username: string,
): Promise<CustomCollection[]> {
  await importLegacy();
  return (
    rawDb
      .prepare(`${select} WHERE username=? ORDER BY updated_at DESC`)
      .all(username) as Row[]
  ).map(fromRow);
}

export async function getUserCollection(
  username: string,
  id: string,
): Promise<CustomCollection | null> {
  await importLegacy();
  const row = rawDb
    .prepare(`${select} WHERE username=? AND id=?`)
    .get(username, id) as Row | undefined;
  return row ? fromRow(row) : null;
}

export async function createUserCollection(
  username: string,
  config: Record<string, unknown>,
  title: string,
): Promise<CustomCollection> {
  await importLegacy();
  const now = new Date().toISOString();
  const value: CustomCollection = {
    id: `custom-${randomUUID()}`,
    title,
    category: "custom",
    config,
    createdAt: now,
    updatedAt: now,
  };
  rawDb
    .prepare(
      "INSERT INTO user_custom_collections(username,id,title,config_json,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    )
    .run(username, value.id, title, JSON.stringify(config), now, now);
  return value;
}

export async function updateUserCollection(
  username: string,
  id: string,
  config: Record<string, unknown>,
  title?: string,
): Promise<CustomCollection | null> {
  await importLegacy();
  const changed = rawDb
    .prepare(
      "UPDATE user_custom_collections SET title=COALESCE(?,title),config_json=?,updated_at=? WHERE username=? AND id=?",
    )
    .run(
      title?.trim() || null,
      JSON.stringify(config),
      new Date().toISOString(),
      username,
      id,
    );
  return changed.changes ? getUserCollection(username, id) : null;
}

export async function deleteUserCollection(
  username: string,
  id: string,
): Promise<boolean> {
  await importLegacy();
  return (
    rawDb
      .prepare("DELETE FROM user_custom_collections WHERE username=? AND id=?")
      .run(username, id).changes > 0
  );
}
