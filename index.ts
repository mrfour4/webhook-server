import { serve } from "bun";
import { existsSync, readFileSync, writeFileSync } from "fs";

const PORT = 3000;
const GITHUB_TOKEN = process.env.GH_PAT_WEBHOOK;

const GITHUB_REPO = "mrfour4/seminar-gitops";
const ENV_FILE = ".env";

// Hàm ghi commit ID vào file .env
function saveHealthyCommit(commitId: string) {
    try {
        let envContent = "";

        // Kiểm tra nếu file tồn tại, đọc nội dung
        if (existsSync(ENV_FILE)) {
            envContent = readFileSync(ENV_FILE, "utf8");
        }

        // Nếu đã có LAST_HEALTHY_COMMIT, thay thế giá trị
        if (envContent.includes("LAST_HEALTHY_COMMIT=")) {
            envContent = envContent.replace(/LAST_HEALTHY_COMMIT=.*/g, `LAST_HEALTHY_COMMIT=${commitId}`);
        } else {
            // Nếu chưa có, thêm mới vào cuối
            envContent += `\nLAST_HEALTHY_COMMIT=${commitId}`;
        }

        writeFileSync(ENV_FILE, envContent.trim(), "utf8");
        console.log(`✅ Saved healthy commit ID to ${ENV_FILE}`);
    } catch (error) {
        console.error(`❗ Failed to save healthy commit: ${error}`);
    }
}

// Hàm đọc commit ID từ file .env
function loadHealthyCommit(): string | null {
    if (!existsSync(ENV_FILE)) {
        console.error("❗ No .env file found");
        return null;
    }
    try {
        const envContent = readFileSync(ENV_FILE, "utf8");
        const match = envContent.match(/LAST_HEALTHY_COMMIT=(.*)/);
        return match && match[1] ? match[1] : null;
    } catch (error) {
        console.error(`❗ Failed to load healthy commit: ${error}`);
        return null;
    }
}


// Gửi webhook đến GitHub để revert
async function triggerGitHubRollback(failedRevision: string, healthyRevision: string) {
    const payload = {
        event_type: "argo-degraded",
        client_payload: {
            failed_revision: failedRevision,
            healthy_revision: healthyRevision,
        },
    };

    console.log("playload: ", payload)

    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
        method: "POST",
        headers: {
            "Authorization": `token ${GITHUB_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (response.ok) {
        console.log("✅ Triggered GitHub Actions for rollback");
    } else {
        console.error("❌ Failed to trigger GitHub Actions", await response.text());
    }
}

// Xử lý yêu cầu webhook từ Argo CD
async function handleRequest(req: Request): Promise<Response> {
    if (req.method !== "POST") {
        return new Response("Only POST requests are allowed", { status: 405 });
    }

    try {
        const data = await req.json();
        console.log("Received payload:", data);

        // Kiểm tra cấu trúc của dữ liệu nhận được
        if (typeof data !== "object" || data === null || !("app" in data) || !("status" in data) || !("revision" in data)) {
            console.error("❗ Invalid payload format:", data);
            return new Response("Invalid payload format", { status: 400 });
        }

        const { status, revision } = data as { status: string; revision: string };

        if (status === "Healthy") {
            // Ghi commit ID khi deploy thành công
            saveHealthyCommit(revision);
            return new Response("Commit ID saved", { status: 200 });
        }

        if (status === "Degraded") {
            // Đọc commit ID khi deploy thất bại
            const lastHealthyCommit = loadHealthyCommit();
            if (!lastHealthyCommit) {
                console.error("❌ No healthy commit found for rollback");
                return new Response("No healthy commit found", { status: 500 });
            }

            console.log("✅ Last Healthy Commit for rollback:", lastHealthyCommit);

            // Gửi webhook đến GitHub Actions
            await triggerGitHubRollback(revision, lastHealthyCommit);
            return new Response("Rollback triggered", { status: 200 });
        }

        return new Response("Webhook received", { status: 200 });
    } catch (error) {
        console.error("❗ Error handling request:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}

// Khởi chạy server webhook
serve({
    port: PORT,
    hostname: "0.0.0.0",
    fetch: handleRequest,
});

console.log(`🚀 Webhook Server is running on http://localhost:${PORT}`);
