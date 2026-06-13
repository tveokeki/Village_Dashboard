import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import jwt from "jsonwebtoken";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

function request(path, cookie) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: Number(process.env.PORT || 3000),
        path,
        method: "GET",
        headers: cookie ? { Cookie: cookie } : {},
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

const userId = crypto.randomUUID();
const email = `uat-common-fee-report-smoke-${Date.now()}@example.invalid`;

try {
  const anon = await request("/api/finance/common-fee-report");
  assert.equal(anon.status, 401, "anonymous report API must be protected");

  await pool.query(
    "INSERT INTO slip_processing.web_users (id,email,display_name,role,is_admin,email_verified) VALUES ($1,$2,'Common Fee Report Smoke','admin',true,true)",
    [userId, email]
  );
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  assert.ok(secret, "NEXTAUTH_SECRET/AUTH_SECRET is required");
  const token = jwt.sign({ sub: userId, email, role: "admin", name: "Common Fee Report Smoke" }, secret, { expiresIn: "10m" });
  const cookie = `next-auth.session-token=${token}`;

  const currentYear = new Date().getFullYear();
  const res = await request(`/api/finance/common-fee-report?from=${currentYear}-01-01&to=${currentYear}-08-05&limit=5`, cookie);
  assert.equal(res.status, 200, res.body);
  const json = JSON.parse(res.body);
  assert.ok(Array.isArray(json.periods), "periods must be an array");
  assert.ok(Array.isArray(json.rows), "rows must be an array");
  assert.equal(json.from, `${currentYear}-01-01`, "from must echo filter/default");
  assert.equal(json.to, `${currentYear}-08-05`, "to must echo filter/default");
  assert.ok(json.periods.length > 0, "selected range should include at least one billing period");
  if (json.rows.length > 0) {
    const row = json.rows[0];
    assert.ok(row.member_id, "row has member_id");
    assert.ok("owner_name" in row, "row has owner_name");
    assert.ok("house_number" in row, "row has house_number");
    assert.ok(Array.isArray(row.cells), "row cells must be horizontal period statuses");
    assert.equal(row.cells.length, json.periods.length, "each row must have one cell per period");
    assert.ok(row.cells.every((cell) => ["paid", "overdue", "pending", "none"].includes(cell.status)), "cell status must be paid/overdue/pending/none");
  }

  const qRes = await request(`/api/finance/common-fee-report?q=__definitely_no_house__&from=${currentYear}-01-01&to=${currentYear}-08-05`, cookie);
  assert.equal(qRes.status, 200, qRes.body);
  const qJson = JSON.parse(qRes.body);
  assert.equal(qJson.rows.length, 0, "q filter should filter owner name/house number");

  console.log("COMMON_FEE_REPORT_API_SMOKE_OK", JSON.stringify({ periods: json.periods.length, rows: json.rows.length, from: json.from, to: json.to }));
} finally {
  await pool.query("UPDATE slip_processing.web_users SET deleted_at=NOW() WHERE id=$1", [userId]).catch(() => {});
  const left = await pool.query("SELECT COUNT(*)::int AS c FROM slip_processing.web_users WHERE email=$1 AND deleted_at IS NULL", [email]).catch(() => ({ rows: [{ c: -1 }] }));
  console.log("SMOKE_USER_ACTIVE_REMAINING", left.rows[0].c);
  await pool.end();
}
