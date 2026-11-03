# Publishing to npm

Two packages come from this repository:

| Package | Folder | What it is |
|---|---|---|
| `tickline` | repository root | The chart |
| `tickline-mcp` | `mcp/` | The MCP server for AI assistants |

The **first release** of each package is published by hand from your computer, because npm only lets you set up automatic publishing for a package that already exists. After that, **every release is automatic**: push a version tag and GitHub Actions publishes both packages (`.github/workflows/release.yml`).

## Before the first release

1. **Create an npm account** at <https://www.npmjs.com/signup> and verify your email address.
2. **Turn on two-factor authentication**: avatar → Account → Two-Factor Authentication. Use an authenticator app or a security key. npm asks for it when you publish.
3. **Check Node.js and npm** on your computer:
   ```sh
   node -v    # 22.14 or later
   npm -v     # 11.5.1 or later; if older: npm install -g npm@latest
   ```

## First release (by hand, once)

4. **Get the code** (the `main` branch, after the release changes are merged):
   ```sh
   git clone https://github.com/vongvisalsambath/tickline.git
   cd tickline
   npm ci
   ```
5. **Check everything passes:**
   ```sh
   npm run typecheck
   npm test
   npm run build
   ```
6. **Sign in to npm** (opens your browser):
   ```sh
   npm login
   npm whoami      # shows your npm username
   ```
7. **See what will be published** without publishing:
   ```sh
   npm publish --dry-run
   ```
   It should list `dist/…`, `README.md`, `LICENSE` and `package.json`, and nothing else.
8. **Publish the chart:**
   ```sh
   npm publish --access public
   ```
   Enter the code from your authenticator app when asked.
9. **Publish the MCP server:**
   ```sh
   cd mcp
   npm publish --dry-run       # dist/tickline-mcp.js, README.md, LICENSE, package.json
   npm publish --access public
   cd ..
   ```
10. **Check they're live:**
    - <https://www.npmjs.com/package/tickline> and <https://www.npmjs.com/package/tickline-mcp>
    - `npm view tickline version`
    - <https://unpkg.com/tickline@0.1.0/dist/tickline.umd.js> loads (the CDN link used in the docs)
    - `npx -y tickline-mcp` starts and waits for input (press Ctrl+C to stop)

## Turn on automatic releases (once per package)

11. On npmjs.com, open **tickline** → **Settings** → **Trusted publishing** → **GitHub Actions**, and enter:

    | Field | Value |
    |---|---|
    | Organization or user | `vongvisalsambath` |
    | Repository | `tickline` |
    | Workflow filename | `release.yml` |
    | Environment | leave empty |
    | Allowed actions | **npm publish** |

    Save. Do the same for **tickline-mcp**.
12. **Lock down tokens** (recommended): in each package's **Settings → Publishing access**, choose **Require two-factor authentication and disallow tokens**. Trusted publishing keeps working, and nobody can publish with a stolen token.

## Every release after that

13. **Bump the version** in both packages (they're released together, with the same version):
    ```sh
    npm version patch --no-git-tag-version              # 0.1.0 → 0.1.1 (or minor / major)
    (cd mcp && npm version patch --no-git-tag-version)
    ```
    Use **patch** for fixes, **minor** for new features, **major** for changes that break existing code.
14. **Update the CDN version** in `README.md`, `site/index.html` and `examples/plain.html` (search for `tickline@`).
15. **Commit, tag and push:**
    ```sh
    git commit -am "Release 0.1.1"
    git tag v0.1.1
    git push origin main --tags
    ```
16. GitHub → **Actions** → **Release** shows the run. When it's green, both packages are on npm with a **provenance** badge, which shows they were built from this repository by this workflow.

If the release run fails at "Tag matches both package versions", the tag and the versions in `package.json` and `mcp/package.json` differ: fix them, delete the tag (`git tag -d v0.1.1 && git push origin :refs/tags/v0.1.1`) and tag again.
