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

async function deploy() {
    const client = new Client();
    client.ftp.verbose = false; // set to true for detailed logs while debugging

    try {
        console.log("🔌 Connecting to InfinityFree via FTP...");
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            secure: false, // InfinityFree typically uses plain FTP, not FTPS
        });

        // 1. Upload dist/index.html -> /htdocs/index.html
        console.log("📄 Uploading index.html...");
        await client.cd(REMOTE_ROOT);
        await client.uploadFrom(
            path.join(LOCAL_DIST_DIR, "index.html"),
            "index.html"
        );

        // 2. Upload dist/assets/* -> /htdocs/Scheduler-Tpro/assets/*
        const remoteAssetsDir = `${REMOTE_ROOT}/${REMOTE_APP_DIR}/assets`;
        console.log(`📁 Uploading assets/ -> ${remoteAssetsDir}`);
        await client.ensureDir(remoteAssetsDir);
        await client.clearWorkingDir(); // clears just the assets subfolder before upload
        await client.uploadFromDir(path.join(LOCAL_DIST_DIR, "assets"));

        console.log("✅ Deploy complete!");
    } catch (err) {
        console.error("❌ Deploy failed:", err.message);
        process.exitCode = 1;
    } finally {
        client.close();
    }
}

deploy();