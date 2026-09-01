import fs from "fs";
import path from "path";
import oracledb from "oracledb";

// Portage TypeScript de arx-prospects/lib/oracle.js — memes decisions :
// wallet extrait de ORA_WALLET_B64, pool unique et bas (21 sessions pour tout
// le parc Always Free), fermeture explicite pour les scripts.
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

const WALLET_DIR = process.env.ORA_WALLET_DIR || "/tmp/wallet";

if (process.env.ORA_WALLET_B64 && !fs.existsSync(path.join(WALLET_DIR, "tnsnames.ora"))) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AdmZip = require("adm-zip");
  fs.mkdirSync(WALLET_DIR, { recursive: true });
  new AdmZip(Buffer.from(process.env.ORA_WALLET_B64, "base64")).extractAllTo(WALLET_DIR, true);
}

let _pool: oracledb.Pool | null = null;

async function pool(): Promise<oracledb.Pool> {
  if (!_pool) {
    _pool = await oracledb.createPool({
      user: process.env.ORA_USER,
      password: process.env.ORA_PASSWORD,
      connectString: process.env.ORA_CONNECT,
      configDir: WALLET_DIR,
      walletLocation: WALLET_DIR,
      walletPassword: process.env.ORA_WALLET_PASSWORD,
      poolMin: 0, poolMax: 4, poolTimeout: 120,
    });
  }
  return _pool;
}

export async function q(sql: string, binds: Record<string, unknown> = {},
                        opts: oracledb.ExecuteOptions = {}) {
  const c = await (await pool()).getConnection();
  // Nos binds sont des objets nommes simples ; le type du driver est plus
  // large (tableaux, descripteurs) et le cast est sans perte.
  try { return await c.execute(sql, binds as oracledb.BindParameters, { autoCommit: true, ...opts }); }
  finally { await c.close(); }
}

export async function qLot(sql: string, lignes: Record<string, unknown>[],
                           bindDefs: Record<string, oracledb.BindDefinition>) {
  if (!lignes.length) return { rowsAffected: 0 };
  const c = await (await pool()).getConnection();
  // Les types du driver attendent BindParameters[] ; nos lignes homogenes en
  // sont un sous-ensemble, le cast est sans risque.
  try {
    return await c.executeMany(sql, lignes as oracledb.BindParameters[],
                               { autoCommit: true, bindDefs });
  } finally { await c.close(); }
}

export async function fermer() {
  if (_pool) { await _pool.close(0); _pool = null; }
}

export { oracledb };
