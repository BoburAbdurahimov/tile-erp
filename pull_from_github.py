import os
import subprocess
import json
import base64
import urllib.request
import urllib.error

def get_gh_token(username="BoburAbdurahimov"):
    res = subprocess.run(
        [r"C:\Program Files\GitHub CLI\gh.exe", "auth", "token", "-u", username],
        capture_output=True, text=True
    )
    token = res.stdout.strip()
    if not token:
        res2 = subprocess.run(
            [r"C:\Program Files\GitHub CLI\gh.exe", "auth", "token"],
            capture_output=True, text=True
        )
        token = res2.stdout.strip()
    return token

def http_request(url, method="GET", data=None, headers=None):
    req = urllib.request.Request(url, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if data is not None:
        req.data = json.dumps(data).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read().decode("utf-8")
            return resp.status, json.loads(resp_body) if resp_body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_body)
        except Exception:
            err_json = {"raw": err_body}
        return e.code, err_json

def pull_from_repo(repo_full_name, target_dir):
    token = get_gh_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "TileERP-Pull"
    }

    # 1. Get latest commit on main branch
    ref_url = f"https://api.github.com/repos/{repo_full_name}/git/refs/heads/main"
    status, res = http_request(ref_url, headers=headers)
    if status == 404:
        ref_url = f"https://api.github.com/repos/{repo_full_name}/git/refs/heads/master"
        status, res = http_request(ref_url, headers=headers)
        if status != 200:
            print(f"Error fetching ref for {repo_full_name}: {res}")
            return False

    commit_sha = res["object"]["sha"]
    print(f"[{repo_full_name}] Fetching latest tree from commit: {commit_sha[:7]}...")

    # 2. Get tree recursively
    tree_url = f"https://api.github.com/repos/{repo_full_name}/git/trees/{commit_sha}?recursive=1"
    status, res = http_request(tree_url, headers=headers)
    if status != 200:
        print(f"Error fetching tree: {res}")
        return False

    tree_items = res.get("tree", [])
    print(f"Found {len(tree_items)} items in GitHub repository.")

    updated_count = 0
    for item in tree_items:
        if item.get("type") == "blob":
            file_path = item.get("path")
            blob_sha = item.get("sha")

            # Fetch blob content
            blob_url = item.get("url")
            b_status, b_res = http_request(blob_url, headers=headers)
            if b_status == 200:
                raw_content = base64.b64decode(b_res.get("content", ""))
                dest_path = os.path.join(target_dir, file_path.replace("/", os.sep))
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)

                # Check if local file needs updating
                needs_update = True
                if os.path.exists(dest_path):
                    with open(dest_path, "rb") as f:
                        if f.read() == raw_content:
                            needs_update = False

                if needs_update:
                    with open(dest_path, "wb") as f:
                        f.write(raw_content)
                    updated_count += 1
                    print(f"  [UPDATED] {file_path}")

    print(f"Finished pulling from {repo_full_name}. Updated {updated_count} files locally.")
    return True

if __name__ == "__main__":
    target_dir = r"C:\Users\User\Desktop\new project"
    print("--- Pulling latest updates from shohruxpy/tile-erp ---")
    pull_from_repo("shohruxpy/tile-erp", target_dir)

    print("\n--- Pulling latest updates from BoburAbdurahimov/tile-erp ---")
    pull_from_repo("BoburAbdurahimov/tile-erp", target_dir)
