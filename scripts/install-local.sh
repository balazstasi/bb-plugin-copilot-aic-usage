#!/usr/bin/env bash
set -euo pipefail

plugin_id="copilot-aic-usage"
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
expected_source="path:${repo_dir}"

for command_name in bb node npm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
done

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if ((node_major < 22)); then
  echo "Node 22 or newer is required; found $(node --version)." >&2
  exit 1
fi

cd "$repo_dir"

echo "Installing dependencies..."
npm ci

echo "Checking and testing the plugin..."
npm run typecheck
npm test

echo "Building the BB plugin..."
npm run build

current_source=""
if source_json="$(bb plugin source "$plugin_id" --json 2>/dev/null)"; then
  current_source="$(
    printf '%s' "$source_json" | node -e '
      let body = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { body += chunk; });
      process.stdin.on("end", () => {
        const value = JSON.parse(body);
        process.stdout.write(typeof value.requested === "string" ? value.requested : "");
      });
    '
  )"
fi

if [[ "$current_source" == "$expected_source" ]]; then
  echo "Plugin is already installed from this checkout; reloading it..."
  bb plugin enable "$plugin_id" >/dev/null
  bb plugin reload "$plugin_id"
else
  echo "Installing the plugin from ${repo_dir}..."
  bb plugin install "$expected_source" --yes
fi

echo
echo "Installation complete:"
bb plugin list | sed -n "/^${plugin_id}@/,+2p"
echo
echo "Open a GitHub Copilot ACP thread in BB to see the AIC badge."
