// deploy.js
// Uploads the Vite build output (dist/) to InfinityFree via FTP.
// Runs automatically after `npm run build` via the "postbuild" npm script.

import { Client } from "basic-ftp";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIST_DIR = path.join(__dirname, "dist");

// Specific upload mapping: local path -> remote path
// index.html goes to the htdocs root, assets go into a subfolder.
const REMOTE_ROOT = process.env.FTP_REMOTE_ROOT || "/htdocs";
const REMOTE_APP_DIR = process.env.FTP_REMOTE_APP_DIR || "Scheduler-Tpro";

async function pathExists(client, parentDir, name) {
    try {
        const list = await client.list(parentDir);
        return list.some((item) => item.name === name);
    } catch {
        return false;
    }
}

async function deploy() {
    const client = new Client();
    client.ftp.verbose = false; // set to true for detailed logs while debugging

    const remoteAppDir = `${REMOTE_ROOT}/${REMOTE_APP_DIR}`;
    const tempAssetsDir = `${remoteAppDir}/assets_new`;
    const backupAssetsDir = `${remoteAppDir}/assets_old`;
    const tempIndexName = "index.html.new";

    try {
        console.log("🔌 Connecting to InfinityFree via FTP...");
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            secure: false, // InfinityFree typically uses plain FTP, not FTPS
        });

        // --- UPLOAD PHASE (slow, but doesn't touch anything live yet) ---

        console.log("📄 Uploading index.html to a temp file...");
        await client.cd(REMOTE_ROOT);
        await client.uploadFrom(
            path.join(LOCAL_DIST_DIR, "index.html"),
            tempIndexName
        );

        console.log(`📁 Uploading assets/ -> ${tempAssetsDir} (temp)...`);
        // Clean up any leftover temp dir from a previous failed run
        if (await pathExists(client, remoteAppDir, "assets_new")) {
            await client.removeDir(tempAssetsDir);
        }
        await client.ensureDir(tempAssetsDir);
        await client.clearWorkingDir();
        await client.uploadFromDir(path.join(LOCAL_DIST_DIR, "assets"));

        // --- SWAP PHASE (fast — this is the only part that touches the live site) ---

        console.log("🔁 Swapping in new files...");

        // Swap index.html
        await client.cd(REMOTE_ROOT);
        await client.rename(`index.html`, `index.html.old`).catch(() => { });
        await client.rename(tempIndexName, "index.html");
        await client.remove("index.html.old").catch(() => { });

        // Swap assets folder
        await client.cd(remoteAppDir);
        const hadOldAssets = await pathExists(client, remoteAppDir, "assets");
        if (hadOldAssets) {
            await client.rename("assets", "assets_old");
        }
        await client.rename("assets_new", "assets");
        if (hadOldAssets) {
            await client.removeDir(backupAssetsDir);
        }

        console.log("✅ Deploy complete!");
    } catch (err) {
        console.error("❌ Deploy failed:", err.message);
        console.error(
            "   Live site was left untouched (or only partially swapped — check manually if this happened during the swap phase)."
        );
        process.exitCode = 1;
    } finally {
        client.close();
    }
}

deploy();