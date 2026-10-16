# Zapis: two selectable styles, implementation plan

## Goal
- Two application styles: **Style 1 = Three-pane** (concept 1, default) and **Style 2 = Command bar** (concept 2).
- Admin sets the company default in **Administration > Application**.
- Each user can pick their own style in **Profile**; the personal choice wins over the company default.
- Assumption: "option 1 and 2" means the concepts numbered 1 and 2 in `zapis-ui-1-three-pane.png` and `zapis-ui-2-command-bar.png`. The current "redesign" look is replaced by Style 1 rather than kept as a third style.

## Current code (checked on branch `redesign`)
- API: Spring Boot, `ch.dmspoc.api`. `ProfileController` (`/api/profile`), `AdminUserController` (`/api/admin/**`, guarded by `AdminInterceptor`), session holds username, first name and admin flag.
- Admin config precedent: `FolderTemplateService` keeps one JSON document in Alfresco at `Company Home/zapis-config/folder-templates.json`. Appearance settings reuse exactly this pattern, so nothing new is needed in Alfresco.
- Web: React + Vite. `App.tsx` (879 lines) owns the layout, `App.css` is one 4,500-line file with tokens in `:root`. `AdministrationPage.tsx` already has tabs (Spaces, Users). `ProfilePage.tsx` has "Your details" and "Change password".

## Design decision: how styles differ
Styles differ in **layout shell and tokens only**. All pages, dialogs, file table logic, merge, tasks and permissions stay shared, so there is one app to maintain, not two.

| Part | Style 1 (default) | Style 2 |
|---|---|---|
| Navigation | Icon rail + spaces list | Top bar + folder tree on the left |
| Actions | Details panel on the right (selection actions, big Merge button) | Toolbar under the top bar (New, Upload, Download, Compare, Merge, Copy, Move, Delete) |
| Colour and type | Teal accent, Instrument Sans | Green accent, Source Sans 3 |
| Selection feedback | Panel with stacked page preview | "2 selected" chip in the toolbar |

## Steps

### 1. Backend: store settings (small)
- `AppearanceService` reading and writing two JSON documents in `zapis-config/`: `app-settings.json` (`{ "defaultStyle": "style1" }`) and `user-preferences.json` (`{ "<username>": { "style": "style2" } }`). Same synchronized read/write approach as `FolderTemplateService`.
- Allowed values: `style1`, `style2`. Anything else is rejected (400). Missing values fall back to `style1`.
- Endpoints:
  - `GET /api/appearance` returns `{ defaultStyle, userStyle | null, effectiveStyle }` for the logged-in user.
  - `PUT /api/profile/appearance` sets or clears (`null` = "use company default") the user's style.
  - `PUT /api/admin/app-settings` sets `defaultStyle`; covered by the existing admin interceptor (403 for non-admins).
- Include `effectiveStyle` in the login response so the first screen renders in the right style without a flash.
- Tests: unit tests for the service (defaults, invalid value, clearing) and an interceptor test for the 403.

### 2. Frontend foundation: make the style a switch, not a fork
- Apply the style as `<html data-style="style1|style2">`. Split `App.css` tokens into `:root[data-style="style1"]` and `:root[data-style="style2"]` (colours, fonts, radii, spacing).
- `AppearanceProvider` (React context): loads `/api/appearance`, exposes `style`, `setMyStyle`, `setDefaultStyle`. Caches the last style in `localStorage` (wrapped in try/catch) for instant first paint.
- Self-host the two font families (Instrument Sans, Source Sans 3) with the app so it works offline and without Google Fonts requests.

### 3. Style 1 shell (default)
- Rework the current `Sidebar` + `Topbar` + `DetailsPanel` into the concept 1 layout: 60 px icon rail, spaces list column, table, right-hand selection panel.
- Move the dark `SelectionBar` actions into the right panel (Merge to PDF as the primary button; Download, Compare, Copy to, Move to, Delete as list actions). Show the panel only while something is selected, otherwise show details of the open space.

### 4. Style 2 shell
- New `TopHeader` (brand, global search with Ctrl K, user), `CommandBar` (the actions from `Toolbar`/`SelectionBar`, enabled by selection, count chip) and `FolderTree` (spaces expanding to folders, using the existing folder API).
- `Documents / Members / Activity` tabs on the space page. Only add tabs whose content already exists; leave out the rest.

### 5. Shared pieces
- `AppShell` picks `Style1Shell` or `Style2Shell` by the active style; routes and pages are unchanged.
- One shared `useSelectionActions()` hook feeds both the panel (Style 1) and the toolbar (Style 2), so Merge, Compare, Copy, Move and Delete behave identically in both.
- `FileTable` takes small style props (type badge vs type icon, owner vs modified-by column), no duplicate table.

### 6. Profile and Administration UI
- Profile: new "Appearance" section with two selectable preview cards (thumbnail + name) and an option "Use company default (Style 1)". Saves immediately and the app restyles without a reload.
- Administration: new **Application** tab with the same two cards for the company default and the text "Applies to everyone who has not chosen their own style." Visible to admins only, same tab behaviour as Spaces and Users.

### 7. Verification
- Admin and non-admin: default is Style 1; admin changes the default to Style 2; a user with no personal choice sees Style 2; a user with a personal choice keeps it; "Use company default" clears it.
- Both styles: browse, upload, select several files, Merge to PDF, Compare, Copy, Move, Delete, tasks, administration, keyboard navigation and focus outlines.
- Screenshot comparison against the two concept PNGs, desktop and a narrow window.

## Order and size
1. Backend + tests, 2. Foundation (tokens, provider, fonts), 3. Style 1 shell, 4. Style 2 shell, 5. Profile and Administration UI, 6. Verification.
Steps 1 and 2 are small; steps 3 and 4 are the bulk of the work (about two thirds). Delivered as one branch and one PR; I'd name it `feature/app-styles` unless you prefer another name.

## Open points (defaults chosen, tell me to change)
- Style 1 replaces the current look; the old look is not kept.
- The choice is stored in Alfresco next to the other Zapis settings, not in the browser, so it follows the user across devices.
- Only two styles now; adding a third later means one shell component plus one token block.
