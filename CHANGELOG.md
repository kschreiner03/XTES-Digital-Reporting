# Changelog

All notable changes to X-TEC Digital Reporting will be documented in this file.

---

## [V 1.1.4] - 2026-02-06

### Added

#### Inline Comments & Highlights System

- Text highlighting with 5 color options (Yellow, Green, Blue, Pink, Orange) on all text fields
- Inline comments on selected text with full create, edit, resolve, reply, and delete support
- Comments Rail sidebar showing all comments for the current report, aligned to their source text
- "Find" button on comment cards that scrolls to and temporarily glows the referenced text
- Filter tabs (All / Open / Done) in the Comments Rail
- Comment author badges using Windows username
- Relative timestamps on comments (e.g., "5m ago")
- Resolve all comments button

#### Unsaved Changes Protection

- "Unsaved Changes" confirmation modal when clicking the Home button with unsaved work
- Same modal appears when clicking the window close (X) button in Electron
- "Cancel" to stay, "Leave Without Saving" to discard changes
- Electron IPC integration (`close-attempted` / `confirm-close`) for window close intercept
- Browser `beforeunload` fallback for non-Electron environments
- Dirty state tracking on all data change handlers across all report types

#### SaskPower DFR Validation

- All fields now highlight red when required and empty on save attempt
- `isInvalid` prop added to all EditableField components (header fields)
- `isInvalid` prop added to all BulletPointEditor components (body fields)
- `isInvalid` prop added to ChecklistRow component (daily checklists) with red text and background styling

#### Photo Drag-and-Drop Reordering

- Drag-and-drop reordering of photos using grip handle (replaces up/down arrow buttons)
- Works across all report types: Standard DFR, SaskPower DFR, Photo Log, and Combined Log
- Powered by @dnd-kit/sortable for smooth, accessible drag interactions

#### Project Hover Preview

- Thumbnail preview tooltip when hovering over recent projects on the Landing Page
- Auto-generated from the first photo in each report (or styled placeholder if no photos)
- Thumbnails stored in IndexedDB and prefetched on Landing Page load
- Thumbnails cleaned up automatically when projects are deleted

#### Layout & UI Improvements

- Wider content area in DfrStandard and DfrSaskpower by removing restrictive xl/2xl breakpoint constraints
- Landing Page recent projects dropdown (3-dots menu) no longer gets cut off behind other elements
- Fixed `overflow-hidden` to `overflow-visible` on the recent projects container
- Increased dropdown z-index to z-50 for proper layering
- Zoom controls (Zoom In, Zoom Out, Reset) on DFR report views

### Fixed

- Missing `fieldId` prop on all BulletPointEditor usages in DfrStandard and DfrSaskpower
- Incorrect field name `'communication'` in DfrSaskpower inline comments and field labels, replaced with correct `'environmentalProtection'`
- `string | undefined` not assignable to `string | null` type error in CombinedLog photo import

---

## [1.1.4] - Initial Release

- Standard DFR report creation and PDF export
- SaskPower DFR report creation and PDF export
- Photo Log with image upload, auto-crop, and PDF export
- Combined Log for merging photos from multiple projects
- Recent Projects with IndexedDB storage
- Project save/load (.dfr, .spdfr, .plog, .clog file formats)
- Dark mode support
- Spell check with configurable languages
- Electron desktop app with auto-updater
- Special character palette
- Photo download as ZIP
