---
name: Starport
description: Compact Chinese workspace for discovering and downloading GitHub repositories.
colors:
  green: "#18725b"
  green-dark: "#105940"
  ink: "#25322e"
  muted: "#65736f"
  line: "#e3e8e5"
  surface: "#fff"
  workspace: "#f7f8fa"
  sidebar: "#f0f3f0"
  selected-row: "#f0f7f2"
  growth: "#207b54"
  warning-bg: "#fff7e6"
  warning-text: "#765416"
  warning-border: "#e9d4a2"
  error-text: "#a24c3c"
  focus-control: "#8fbcaa"
  focus-field: "#7aaf99"
typography:
  headline:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.03em"
  title:
    fontSize: "16px"
    fontWeight: 650
  body:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    lineHeight: 1.55
  repository-title:
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.6
  description:
    fontSize: "12px"
    lineHeight: 1.7
  label:
    fontSize: "11px"
    fontWeight: 550
rounded:
  small: "4px"
  count: "6px"
  control: "7px"
  navigation: "8px"
  container: "9px"
  brand: "12px"
spacing:
  control-gap: "7px"
  filter-gap: "9px"
  inline: "10px"
  control-padding: "8px 13px"
  row-padding: "17px 10px"
  main-padding: "32px 30px 40px"
  panel-padding: "31px 23px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "{spacing.control-padding}"
  button-primary-hover:
    backgroundColor: "{colors.green-dark}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "{spacing.control-padding}"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  repository-container:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.container}"
  repository-selected:
    backgroundColor: "{colors.selected-row}"
    padding: "{spacing.row-padding}"
  notice-warning:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning-text}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
---

# Design System: Starport

## Overview

**Creative North Star: "Operate"**

Starport is a compact Chinese operational workspace. Its code-led visual direction supports scanning repository identities, comparing Star counts, selecting projects, and managing local downloads. The user-confirmed compact list and persistent download panel define the current surface.

Quiet sage navigation, a near-white workspace, white working surfaces and restrained green actions keep the repository data prominent. Native system typography supports Chinese text without external font loading. This document records the implemented system in `public/style.css`, `public/index.html` and `public/app.js`; token values in the frontmatter are normative.

**Key Characteristics:**
- Compact repository rows with aligned, tabular numeric columns.
- Green actions and selection feedback; amber data notices and explicit failure text.
- Flat surfaces, fine borders and consistent line icons.
- Persistent desktop download controls that follow the list on mobile.

## Colors

The palette combines low-contrast neutral surfaces with green action and status accents. Frontmatter names describe the actual CSS values rather than a separate brand palette.

### Primary

- **Green** identifies primary buttons, links, checkbox accents, tab underlines and selected counts. **Green Dark** is the primary-button hover state.
- **Growth** highlights period Star gains; numerical emphasis also uses weight, alignment and the plus sign.

### Neutral

- **Ink** is the base text color; **Muted** supports secondary information.
- **Workspace**, **Sidebar** and **Surface** distinguish the page, navigation and working areas. **Line** separates major regions.
- **Selected Row** marks selection in addition to the checked checkbox.

Amber warning colors belong to stale/degraded-data notices. Error text belongs to queue failures; failed/interrupted badges and error toasts have their own local red-brown treatments in CSS. Language dots are categorical metadata, not additional interface accents. Focus colors belong to visible keyboard outlines.

## Typography

The shared font stack is Segoe UI, Microsoft YaHei, then sans-serif. No separate display or monospace brand font is defined. Headline, title, repository-title, description and label roles use the values above; regular body weight is inherited from the browser default.

Page headings decrease to (23px) at the 1200px breakpoint and (22px) at 960px. Repository titles decrease to (12px), descriptions to (11px), metadata to (9px), and numeric cells to (11px) at 720px. Desktop table headers and metadata use (10px). Dense helper text spans (9–11px), as implemented, rather than following a fabricated modular scale.

Ranks, Star counts and count badges use tabular numerals. Repository names and paths may break anywhere; descriptions have a two-line clamp by default and three lines at 960px and below.

## Layout

The default shell has fixed navigation (214px), a top bar (65px), and a centered workspace capped at (1800px). The workspace grid is `minmax(0, 1fr) 324px`. Main and panel padding are documented in the frontmatter. The download panel is sticky at the viewport top, occupies (100vh), and scrolls internally. The selected repository list has a maximum height of (225px).

The repository table uses fixed layout. Identity and description take the remaining width; selection (34px), rank (39px), and two right-aligned numeric columns (89px each) preserve comparability. Table rows use fine horizontal rules. Filters use a flexible search field and compact selects.

Responsive rules are cumulative:

- At **1600px and above**, the panel grows to (355px), numeric columns to (110px), main padding to (37px 42px), and panel padding to (37px 28px).
- At **1200px and below**, navigation is (184px), panel (285px), numeric columns (76px), main padding (27px 20px), and panel padding (29px 18px). Search occupies a full filter row; language and sort controls share the next row. English tab subtitles disappear.
- At **960px and below**, navigation becomes a (68px) icon rail, the panel is (280px), and numeric columns are (70px). Navigation labels and supporting sidebar content hide; accessible names remain. The refresh button displays its icon.
- At **720px and below**, navigation becomes a fixed top bar (57px); the main content begins below it. The workspace becomes a vertical flex layout. Main padding is (25px 16px 28px). The panel follows the list, loses sticky positioning and fixed height, and uses (25px 20px) padding. Numeric columns are (68px), rank (28px), selection (29px). English tab subtitles return. The selected list caps at (200px). History content and actions wrap.

## Elevation & Depth

Working surfaces are flat: background changes and one-pixel borders define regions without card shadows. The transient toast is the only authored box-shadow (`0 8px 28px #203e3229`); its fixed placement and higher stacking distinguish feedback from page content. No backdrop blur or ornamental depth is used.

## Shapes

Controls share gently rounded corners, while navigation, tables and brand marks use the distinct radii above. Counts have compact rounded rectangles; status and language indicators are circles. Empty states use dashed borders. Standard SVG icons are outline-only with rounded caps and joins (18px, 1.7 stroke); brand and component icons have explicit local size overrides.

## Components

### Buttons

Compact primary and bordered secondary buttons share the documented padding, a minimum height of (36px), and (12px/550) text. Primary hover uses Green Dark; secondary hover uses `#edf3ef`. Background transitions last (.15s). Disabled controls use opacity (.48) and a not-allowed cursor. The full-width download button has (12px) padding and a (42px) minimum height; its disabled appearance uses `#a4c1b0`, white text and full opacity. Text actions use green text and underline on hover.

### Inputs / Fields

Search, selects and directory fields use white surfaces, fine `#dce3de` borders and the control radius. Search input padding is (9px 7px 9px 0); selects use (9px 26px 9px 10px); directory text uses (10px). Field labels precede controls; helper text follows. The directory picker is an adjoining icon button. Placeholder text uses `#5f7066`.

### Navigation

Sidebar buttons use (13px/550) text, icon-label alignment and (12px 13px) padding. Active navigation uses a pale green fill and darker green text. Period tabs use a single (3px) underline, heavier active text, and roving tab focus with arrow/Home/End support. Mobile retains the same destinations as icon buttons with accessible labels.

### Repository List / Containers

The bordered white table is the canonical repository container. A checked checkbox and Selected Row background communicate selection together. Hover adjusts the background; a newly selected row receives one (.35s) acknowledgement. Selection survives filters and page changes and is mirrored in the download panel. Keep repository identity, description and metadata together; maintain right alignment for comparable counts.

### Counts / Status Tags

Counts use (11px/650) text with tabular numerals and the count radius. Job status tags use (10px) text, (2px 7px) padding and the small radius. Completed, failed/interrupted and running states have distinct colors plus explicit text. The small download-speed tag uses (9px) text and a local (3px) radius.

### Notices / Feedback

Amber bordered notices carry data warnings and snapshot times. Empty and error results use centered text, an icon and an available recovery action. Loading uses a (25px) rotating border indicator; running downloads use a thin progress element. Toasts remain brief and fixed near the bottom. Buttons, links and summaries receive a (3px) visible focus outline with (3px) offset; fields use a (2px) outline with (1px) offset. Reduced-motion preferences remove transitions and reduce animation duration to (.01ms).

## Do's and Don'ts

### Do:

- **Do** preserve aligned numeric columns and readable Chinese repository text at every breakpoint.
- **Do** pair selection and status colors with checkboxes, labels or other explicit state cues.
- **Do** retain visible keyboard focus and the implemented reduced-motion treatment.
- **Do** show source, timestamp, candidate scope and stale-data notices alongside results.

### Don't:

- **Don't** replace this compact working list with decorative metric cards.
- **Don't** imply that Trending candidates form an exhaustive global growth ranking.
- **Don't** require hover to reveal an essential action or state.
- **Don't** merge Git clone and source ZIP labels; their distinct download behavior must remain visible.

## Public portal refinement · 2026-10-16

The user requested a quieter shell and only ZIP downloads plus clone commands. Remove the top bar, brand subtitle, decorative status dots and helper controls. Sidebar copy is a short dark introduction (18px heading, 13px body). Main heading and selection toolbar both begin at 36px on desktop; paired bulk controls share a 42px height. Each selected repository has aligned ZIP, copy-command and remove controls. Keep the optional directory field clearly scoped to generated commands. Period lists use 10 rows per page with pagination above the table. Mobile retains the selection panel after the list and gains a fixed, labeled shortcut to it once repositories are selected. No cloud download status may claim completion merely from starting a browser request.
