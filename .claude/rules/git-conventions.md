---
description: Commit message conventions (Conventional Commits, bullet-point body). Apply to every git commit.
---

# Git conventions

Every git commit message MUST follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).

## Format

```
<type>(<scope>)<!>: <subject>

- <bullet describing a change>
- <bullet describing a change>

<footer(s)>
```

## Subject

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- Scope is optional, lowercase, and names the area: `api`, `web`, `docker`, `auth`, `search`, `merge`,
  `workspace`, `tasks`, `admin`, `docs`
- Imperative mood, lowercase after the colon, no trailing period, max 72 characters
- Breaking change: add `!` after the type/scope and a `BREAKING CHANGE: <description>` footer

## Body

- Blank line after the subject
- The description is bullet points only (`- `), no prose paragraphs
- One change per bullet, saying what changed and why, wrapped at ~100 characters
- Omit the body only for trivial commits (typo, formatting)

## Footer

- Issue references (`Refs: #12`, `Closes: #12`) when applicable
- The `Co-Authored-By` trailer required by the harness attribution goes last

## Rules

- One logical change per commit; split unrelated changes into separate commits
- Never use `--no-verify`, and never amend commits that were already pushed

## Example

```
feat(web): add task list page

- Add Tasks page with assigned/created tabs and detail view
- Add notification badge on the workspace rail for new assignments
- Wire api.ts to the new /api/tasks endpoints

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```
