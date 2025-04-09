# GitOps Webhook Server

## 📌 Purpose

This webhook server acts as a middle layer in an automated **GitOps rollback mechanism** using **Argo CD** and **GitHub Actions**.

When an application deployed by Argo CD enters a `Degraded` state, Argo CD sends a webhook to this server. The server performs the following tasks:

1. **Extracts the commit SHA** from the webhook payload, including:
   - `failed_revision`: The current broken version.
   - `healthy_revision`: The last known good version.

2. **Triggers a GitHub Actions workflow** in the GitOps repository (`seminar-gitops`) by sending a `repository_dispatch` event to GitHub. The event contains the `healthy_revision` SHA.

3. **GitHub Actions reverts** the content of `nextjs/values.yaml` to the specified `healthy_revision` and commits the change back to the `main` branch.

4. **Argo CD automatically syncs** the reverted configuration, restoring the application to a healthy state.

---

## 🌐 API Endpoint

- **POST /**
  - Accepts JSON payload from Argo CD:
    ```json
    {
      "event_type": "argo-degraded",
      "client_payload": {
        "failed_revision": "<SHA>",
        "healthy_revision": "<SHA>"
      }
    }
    ```

- Sends a request to GitHub API:
  - `POST https://api.github.com/repos/mrfour4/seminar-gitops/dispatches`

---

## ⚙️ Environment Variables

- `GH_PAT_WEBHOOK` – Personal Access Token with repo and workflow scope to trigger GitHub Actions.
- `REPO_OWNER` – GitHub username (e.g., `mrfour4`).
- `REPO_NAME` – Target GitHub repo (e.g., `seminar-gitops`).
- `WEBHOOK_EVENT` – Custom event name for repository_dispatch (default: `argo-degraded`).

---

## 🚀 How to Run

```bash
bun start
```

Ensure you have a `.env` file with the necessary environment variables.

---

## ✅ Example

If Argo CD reports the application is degraded at commit `abc123`, and the last healthy state was `e4a1dfd9...`, the payload will be:

```json
{
  "event_type": "argo-degraded",
  "client_payload": {
    "failed_revision": "abc123",
    "healthy_revision": "e4a1dfd9eaddb3f5bb856752cf060622560bbaa2"
  }
}
```

The server will forward this to GitHub Actions to trigger a rollback to `healthy_revision`.