# Implementation plan: Gerer Build Studio product rename

## Objective

Replace every repository reference to the former application identity with the canonical name `Gerer Build Studio`. This includes human-facing branding and machine-facing namespaces; the result must not be a cosmetic rename layered over stale package names, environment variables, storage paths, bridge globals, service names, or documentation.

Mouse-themed visual vocabulary such as `MausAvatar`, mascot expressions, and cursor artwork remains in scope as product design, not as the former application name. Git history and `.git/config` are repository metadata outside the codebase and will not be rewritten.

## Inventory

The audit found legacy identity references in 72 tracked files plus two overlapping dirty files:

- visible product copy in HTML, onboarding, updater, project fallback, server errors, prompts, README, contribution/security guidance, and integration docs;
- build identity in `package.json`, `electron-builder.yml`, artifact names, app ID, macOS privacy strings, release repository names, and the public icon title;
- runtime namespaces in `window.ogb`, `src/types/ogb.d.ts`, `OMB_*`/`OGB_*`/`OPENMAUSBOT_*` environment variables, API health output, MCP server names, sockets, temp paths, cloud-box names, and analytics keys;
- persistence in `~/.openmausbot`, platform application-support candidates, log directories, and test fixtures;
- historical implementation plans and Review board documents that still contain examples from the former identity;
- `.env.local`, whose Trello board name points at the existing legacy-named board; and
- the untracked `package-lock.json`, whose root package name is stale.

The untracked `Ai workflow template/` directory contains no legacy-name matches and will remain untouched. The user's existing `package.json` development-script/dependency edits will remain unstaged; only the package-name hunk will belong to this task.

## Canonical naming contract

| Purpose | New value |
|---|---|
| Display/product name | `Gerer Build Studio` |
| npm/package/repository slug | `gerer-build-studio` |
| GitHub source repository | `GererBuildStudio` |
| GitHub release repository | `gerer-build-studio-releases` |
| Electron app ID | `com.gererbuildstudio.app` |
| Renderer bridge | `window.gbs` and `src/types/gbs.d.ts` |
| Environment prefix | `GBS_` |
| Local short prefix | `gbs` |
| Harness health identity | `gerer-build-studio` |
| Server data directory | `~/.gerer-build-studio` |
| Platform user-data/log display directory | `Gerer Build Studio` |
| Trello board | `Gerer Build Studio Tasks` |

Names used by external protocols will use lowercase hyphenated forms where spaces are invalid. Tests will pin the exact mapping so variants do not drift later.

## Data preservation decision

A true repository-wide removal conflicts with an in-code automatic migration: migration code must literally identify the former data/application-support directories. The recommended implementation prioritizes user data and uses one isolated legacy migration module containing the only remaining legacy literals. On startup it will:

1. prefer the new data directory when it already contains data;
2. copy, never move or delete, the former server data into `~/.gerer-build-studio` when the new directory is absent;
3. let Electron copy the former platform user-data files needed by the app into the new `Gerer Build Studio` directory before services read them;
4. leave the source directories untouched for rollback; and
5. cover precedence, partial failure, permissions, and idempotency with isolated temporary-directory tests.

After migration, no normal runtime path, UI copy, prompt, API, build identifier, or documentation will use the former identity. The final audit will report the dedicated migration allowlist separately. If the user's requirement is instead literal zero matches, the migration module must be omitted and existing installations will start with fresh app state unless users manually copy their data.

## Proposed changes

1. **Introduce one identity source of truth.**
   - Add shared canonical constants where runtime/module boundaries allow them, while keeping Electron CJS/MJS and browser bundling constraints clear.
   - Update package metadata, HTML title, icon title, Electron app ID/product/artifact names, privacy strings, updater owner/repository paths, and release/download documentation.
   - Update the tracked package-name hunk without staging the user's unrelated `package.json` changes.
   - Update and commit the currently untracked `package-lock.json` only if this plan's approval explicitly authorizes incorporating that generated file; validate that its dependency graph matches `package.json`.

2. **Rename runtime interfaces comprehensively.**
   - Rename `src/types/ogb.d.ts` to `src/types/gbs.d.ts`, `window.ogb` to `window.gbs`, preload exposure, and every renderer consumer.
   - Rename all `OMB_*`, `OGB_*`, and embedded-host environment variables to `GBS_*`; rename tests, E2E flags, proxy contracts, comments, and documentation in the same commit so there is no mixed API.
   - Rename local-storage keys, MCP names, permission sockets, fake/test prefixes, cloud-box names, remote `/opt` directories, and screenshot/temp paths to `gbs` equivalents.
   - Treat these internal interfaces as an atomic breaking rename; no legacy aliases remain outside the migration allowlist.

3. **Rename persistence and app identity safely.**
   - Change the server data directory to `~/.gerer-build-studio`, Electron logs/user-data discovery to `Gerer Build Studio`, and project-registry discovery to the new directory.
   - Implement the isolated copy-forward migration described above before `ensureDirs()` and Electron project/CUA services initialize.
   - Update test setup so tests never touch either real data location.
   - Change health responses and Electron server validation together so startup remains coherent.

4. **Rename product behavior and agent context.**
   - Replace onboarding, project-browser fallback, updater banner, server startup/error copy, permission broker messages, agent prompts, inter-agent context, computer terminal labels, and MCP service metadata.
   - Keep mouse mascot component names and visuals unchanged because they are not application-name references.

5. **Update all maintained repository text.**
   - Rewrite README, contribution, security, Claude/Codex instructions, issue template, computer-use decision record, implementation plans, Review task examples, source comments, and `.env.example`.
   - Change source/release GitHub references according to the canonical contract. Link validation will distinguish syntactically updated links from repositories that may not exist remotely yet.
   - Update `.env.local` without exposing its credentials and rename the existing Trello board through its API before syncing task cards.

6. **Audit and verify.**
   - Search tracked and relevant ignored workspace files for all case variants, compact abbreviations, path fragments, bundle IDs, and former repository names.
   - Permit matches only in the explicitly named migration module/tests if data preservation is approved.
   - Run TypeScript checks, all Vitest tests, production build, server build/syntax checks, and Electron syntax checks.
   - Smoke-test onboarding, Projects, chat, settings, and updater-adjacent layout at 900×600 and 1440×920; confirm `window.gbs` and project loading work without browser console errors.

## Risks and rollback

- **Existing data becomes invisible:** changing storage names without migration presents an empty app. The copy-forward migration avoids destructive moves and keeps rollback possible.
- **Bundle identity changes:** changing the Electron app ID can affect macOS permissions, keychain/TCC association, updater continuity, and installed-app replacement behavior. Users may need to grant microphone/screen permissions again under the new app identity.
- **Release URLs may not exist:** mechanically renamed GitHub source/release destinations require corresponding remote repositories. The code can be internally correct while download links or publishing fail until those remotes exist.
- **Environment integrations break:** scripts using former environment prefixes will need the new `GBS_*` variables. Tests and shipped Electron launch configuration change atomically.
- **Dirty-file overlap:** `package.json` contains unrelated user edits and `package-lock.json` is untracked. Scope-aware staging protects the former; the latter requires explicit approval to commit.
- **Historical documentation drift:** implementation history will retain its meaning but examples and paths will be rewritten to the current identity, so it is no longer a byte-for-byte historical snapshot.

Rollback is a set of scoped Git reverts. Because migration copies data and never removes the source, reverting the application leaves the previous data available.

## Approval

Status: awaiting user approval

Approval should confirm both of these points:

1. Keep the recommended, isolated legacy migration allowlist instead of requiring literal zero legacy-name matches and losing automatic data continuity.
2. Allow the existing untracked `package-lock.json` to be updated and committed as part of the rename, without otherwise changing dependency versions.
