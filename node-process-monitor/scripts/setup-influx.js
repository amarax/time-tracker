import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.join(__dirname, "..");
const bin = path.join(root, "influxdb", "bin", "influxdb3.exe");
const zip =
  "https://dl.influxdata.com/influxdb/releases/" +
  "influxdb3-core-3.10-windows-amd64.zip";
import schema from "../influx-schema.json" with { type: 'json' };

function setup() {
  // ------------------------------------------------------------------
  // 1) download binary once
  // ------------------------------------------------------------------
  if (!fs.existsSync(bin)) {
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    console.log("⬇  Downloading InfluxDB 3 …");
    // Use cmd.exe with curl and tar for download and extraction
    // Use forward slashes for curl and tar paths to avoid URL/port parsing issues
    const influxZip = `${root.replace(/\\/g, "/")}/influx.zip`;
    const binDir = `${path.dirname(bin).replace(/\\/g, "/")}`;
    const downloadCmd = `curl -L -o "${influxZip}" "${zip}"`;
    const extractCmd = `tar -xf ${influxZip} -C ${binDir}`;
    // Download
    spawnSync("cmd.exe", ["/c", downloadCmd], { stdio: "inherit" });
    // Extract
    console.log(extractCmd);
    spawnSync("cmd.exe", ["/c", extractCmd], { stdio: "inherit" });
  }

  // ------------------------------------------------------------------
  // 2) hash the schema – rerun bootstrap only if it changed
  // ------------------------------------------------------------------
  const hash = crypto
    .createHash("sha1")
    .update(JSON.stringify(schema))
    .digest("hex");
  const stamp = path.join(root, "influxdb", `.schema-${hash}`);
  if (fs.existsSync(stamp)) {
    console.log("✔  Schema already bootstrapped");
    return;
  }

  // common CLI flags (file store, no auth, local data dir)
  const common = [
    // "--object-store",
    // schema.objectStore,
    // "--data-dir",
    // schema.dataDir,
    // "--without-auth", // open server ✔ :contentReference[oaicite:0]{index=0}
  ];
  const run = (args) =>
    spawnSync(bin + "", args.concat(common), { stdio: "inherit" });

  // ------------------------------------------------------------------
  // 3) create databases & tables
  // ------------------------------------------------------------------
  const dbs = new Set(schema.tables.map((t) => t.database));
  dbs.forEach((db) => run(["create", "database", db])); // :contentReference[oaicite:1]{index=1}

  for (const t of schema.tables) {
    let cmd = [
      "create",
      "table",
      t.name,
      "--database",
      t.database
    ]
    if(t.tags) {
      const tagList = t.tags.join(",");
      cmd = [...cmd, "--tags", tagList];
    }
    if(t.fields) {
      const fieldPairs = Object.entries(t.fields)
        .map(([k, v]) => `${k}:${v}`)
        .join(",");
      cmd = [...cmd, "--fields", fieldPairs];
    }
    run(cmd); // :contentReference[oaicite:2]{index=2}
  }

  fs.writeFileSync(stamp, "bootstrap ok");
  console.log("✔  Schema bootstrap complete");
}

setup();
