# Glimpsapp Admin — Complete Visual UI Audit Deliverable

This archive contains the complete, uncompressed visual UI audit screenshots captured from the live **Glimpsapp Admin** application prior to the **Design 3: Compact Professional Admin** redesign.

Every screenshot is an authentic, unscaled browser rendering captured via automated Chromium CDP (Microsoft Edge) connected to the running Next.js application and local PostgreSQL database.

---

## Deliverable Summary

- **Total Screenshots:** 58 images
- **Resolution:** Full desktop (`1600×900`), Laptop (`1280×800`), Tablet (`768×1024`), Mobile (`390×844`)
- **Theme Support:** Both Light Theme and Dark Theme
- **Contact Sheet:** Accompanied by `Glimpsapp-Admin-UI-Audit-Contact-Sheet.pdf` with numbered thumbnails and captions

---

## Directory & File Inventory

### 01-dashboard (Dashboard & Core Analytics)
- `00-login-screen.png` — **Authentication Screen** (`/login` @ 1600×900)  
  Dark navy centered authentication container, branding header, email & password inputs with iconography, and primary "Sign in" action button.
- `01-dashboard-light-1600x900.png` — **Full Dashboard Overview (Light Theme)** (`/dashboard` @ 1600×900)  
  Light lavender workspace, 4 quick action buttons (`+ Create Event`, `Add Venue`, `Manage Plans`, `Push Notification`), 4 time range filter buttons (`Last 1 month`, `Last 3 months`, `Last 6 months`, `Custom`), 7 KPI metric cards with colored badge icons, and Recharts analytics graphs.
- `02-dashboard-dark-1600x900.png` — **Full Dashboard Overview (Dark Theme)** (`/dashboard` @ 1600×900)  
  Deep navy workspace (`#0e1424`), elevated dark cards (`#151d30`), sun theme toggle icon, glowing metric badges, and high-contrast dark theme chart rendering.
- `03-dashboard-time-range-custom.png` — **Custom Date Range Filter** (`/dashboard` @ 1600×900)  
  Active "Custom" filter tab revealing inline start date (`06/01/2026`) and end date (`11/30/2026`) picker inputs.
- `04-dashboard-metrics-and-charts.png` — **Analytics & Chart Detail View** (`/dashboard` @ 1600×900)  
  Scrolled focus on the Recharts bar chart ("Events created - last 6 months") and donut chart ("Events by status - published vs draft").
- `05-dashboard-user-profile-menu-open.png` — **User Profile Dropdown Menu** (`/dashboard` @ 1600×900)  
  Active dropdown popover displaying current user identity (`niks`, `Super Admin`), quick links to Profile (`/dashboard/profile`), Change Password (`/dashboard/change-password`), and Sign Out.

---

### 02-sidebar-and-layout (Navigation & Structural Layout)
- `01-sidebar-expanded.png` — **Expanded Navigation Sidebar** (Layout @ 1600×900)  
  Full ~260px fixed navy sidebar with top Glimpse logo, purple active gradient pill on Dashboard, navigation module items, collapse trigger chevron, and starry night photographer artwork at bottom.
- `02-sidebar-collapsed.png` — **Collapsed Navigation Sidebar** (Layout @ 1600×900)  
  Icon-only ~70px collapsed state maximizing workspace area, flipped expand chevron trigger, and icon navigation.
- `03-sidebar-photographer-artwork.png` — **Sidebar Photographer Artwork Detail** (Layout detail)  
  High-resolution detail of the signature sidebar illustration: silhouette photographer looking through camera lens into a starry purple nebula.
- `04-topbar-light.png` — **Sticky Top Navigation Bar (Light Theme)** (Layout detail)  
  Light theme topbar with module title ("Dashboard"), moon theme toggle icon, and user avatar pill.
- `05-topbar-dark.png` — **Sticky Top Navigation Bar (Dark Theme)** (Layout detail)  
  Dark theme topbar with dark surface styling, sun theme toggle icon, and user badge.
- `06-scrolling-behavior.png` — **Independent Scroll Behavior** (Layout @ 1600×900)  
  Demonstrates sticky topbar retaining elevation shadow at the top while content scrolls underneath and the sidebar remains fixed.

---

### 03-events (Event Listing & Multi-Step Wizard)
- `01-events-list-all.png` — **Events Master Listing** (`/dashboard/events` @ 1600×900)  
  Events data table: Cover image thumbnail, Event Name, Event Code, Category badge, Start/End dates, Status dropdown (`Draft` / `Published`), E-Invite PDF link, and 9 action triggers per row (`Edit`, `Happening`, `QR`, `Media`, `People`, `Notify`, `Feed`, `Export`, `Delete`).
- `02-events-list-published-filter.png` — **Events Listing — Published Filter** (`/dashboard/events` @ 1600×900)  
  Table filtered to show only published events with green status pills.
- `03-events-list-draft-filter.png` — **Events Listing — Draft Filter** (`/dashboard/events` @ 1600×900)  
  Table filtered to show only draft events with grey status pills (`abhi wed`).
- `04-events-search-active.png` — **Events Table Live Search** (`/dashboard/events` @ 1600×900)  
  Real-time client-side search filtering by keyword `"abhi"`.
- `05-event-create-step1-details.png` — **Create Event Wizard — Step 1: Basic Details** (`.../addEditEvent?mode=create` @ 1600×900)  
  Step 1 of 7: Event Title, Event Category select, Start/End date pickers, Main Venue selector, App Theme selector, Cover Image uploader, and Greetings message.
- `06-event-create-step2-sessions.png` — **Create Event Wizard — Step 2: Days & Sessions** (`.../addEditEvent` @ 1600×900)  
  Step 2 of 7: Dynamic multi-day event schedule builder with session title, start/end time pickers, and session venue override.
- `07-event-create-step3-team.png` — **Create Event Wizard — Step 4: Planner & Photographer** (`.../addEditEvent` @ 1600×900)  
  Step 4 of 7: Event team contacts, planner name/phone/email, photography studio name, contact person, and social links.
- `08-event-create-step4-settings.png` — **Create Event Wizard — Step 7: Event Admins** (`.../addEditEvent` @ 1600×900)  
  Step 7 of 7: Assignment of administrative users to this event scoped to allowed purchase plan quotas.
- `09-event-edit-form.png` — **Edit Event Wizard Overview** (`.../addEditEvent?mode=edit&eventId=...` @ 1600×900)  
  Pre-filled wizard loaded with existing data for event `abhi wed` (`ABHI1234`).

---

### 04-venues (Venue Management)
- `01-venues-list.png` — **Venues Master Listing** (`/dashboard/venues` @ 1600×900)  
  Venue listing table showing Venue name, address, city, state, country, scope pill (`Private` vs `Global`), and Edit/Delete buttons.
- `02-venue-create-modal.png` — **New Venue Creation Modal** (`/dashboard/venues` @ 1600×900)  
  Modal form: Name, Address, Description, City, State, Country, Postal code, Coordinates (Latitude & Longitude), Background photo uploader, Sub-venues repeater, and Contacts manager.
- `03-venue-edit-modal.png` — **Edit Venue Modal** (`/dashboard/venues` @ 1600×900)  
  Modal prefilled with "Phase Test Palace" data (Jaipur) with existing coordinates and contacts.

---

### 05-users-access (Users, RBAC & Access Control)
- `01-users-list.png` — **Users & Roles Directory** (`/dashboard/admins` @ 1600×900)  
  User table: Name, Email, Role badge (`super_admin`, `client_admin`, `support_staff`), Scope pill (`Platform Root`, `Client assigned`), Active status toggle, and Edit action.
- `03-user-create-dialog.png` — **New User Dialog** (`/dashboard/admins` @ 1600×900)  
  User creation form: Full Name, Email, Password, Role selector, Purchase Plan assignment (for client admins), and client assignment controls.
- `04-user-edit-dialog.png` — **Edit User Dialog** (`/dashboard/admins` @ 1600×900)  
  Profile edit form, password reset, status locking, and assigned scope modifications.
- `05-user-permissions-view.png` — **Roles & Default Permissions Matrix** (`/dashboard/admins` @ 1600×900)  
  Modal dialog with granular permission toggles grouped by: Events & Sessions, Media & AI Recognition, Highlights & QR, Settings.

---

### 06-purchase-plans (Purchase Plans & Feature Quotas)
- `01-plans-list-overview.png` — **Purchase Plans & Feature Bundles Overview** (`/dashboard/plans` @ 1600×900)  
  Side-by-side tier comparison cards for **Glimpse Signature** (Recommended, Default), **Glimpse Essential**, and **Glimpse Elite**.
- `02-plan-essential-details.png` — **Glimpse Essential Plan Detail** (`/dashboard/plans` detail)  
  Quotas: 10 Events, 2 Event Admins, 1 Session Uploader, 5 Team sub-users, 11/19 features enabled with struck-through disabled features.
- `03-plan-signature-details.png` — **Glimpse Signature Plan Detail** (`/dashboard/plans` detail)  
  Quotas: 50 Events, 5 Event Admins, 3 Session Uploaders, 25 Team sub-users, all 19 features enabled with purple highlight styling.
- `04-plan-elite-details.png` — **Glimpse Elite Plan Detail** (`/dashboard/plans` detail)  
  Quotas: Unlimited Events, 10 Event Admins, 10 Session Uploaders, Unlimited Team sub-users, all 19 features enabled.
- `05-plan-edit-modal.png` — **Edit Purchase Plan Modal** (`/dashboard/plans` @ 1600×900)  
  Configuration modal for adjusting plan limits, descriptions, recommended/default flags, and capability checkboxes.

---

### 07-notifications (Push Notification Composer)
- `01-notifications-list.png` — **Global Push Notification Composer** (`/dashboard/notifications` @ 1600×900)  
  Push notification sender: Event selector, Audience selector (All Guests, Specific Wedding Side, Custom Users), Title input, Message body textarea.
- `02-notification-create-modal.png` — **Notification Mobile Preview Card** (`/dashboard/notifications` @ 1600×900)  
  Live interactive mobile device preview rendering the push notification as it appears on iOS and Android lock screens with app branding.

---

### 08-explore (Explore Categories & Nearby Attractions)
- `01-explore-categories-list.png` — **Explore Categories Directory** (`/dashboard/explore-categories` @ 1600×900)  
  Explore categories table (e.g. Restaurants, Attractions, Salons, Hotels) with icon thumbnails, active item counts, and actions.
- `02-category-create-modal.png` — **New Explore Category Modal** (`/dashboard/explore-categories` @ 1600×900)  
  Modal dialog with Category Name input, icon picker, and description.

---

### 09-media (Event Media Gallery)
- `01-event-media-gallery.png` — **Event Media Gallery & Upload Dock** (`.../events/[id]/media` @ 1600×900)  
  Session-filtered media gallery for event `abhi wed`, multi-select batch deletion, folder upload triggers, and session assignment controls.

---

### 10-feeds (Feed Content Moderation)
- `01-event-feed-moderation-list.png` — **Feed Moderation Dashboard** (`.../events/[id]/feed` @ 1600×900)  
  Event feed moderation dashboard with status tabs (`All`, `Active`, `Moderated`), report count badges, author identity, and moderate/hide/delete action triggers.

---

### 11-app-themes (Dynamic 4-Color Management)
- `01-app-themes-list.png` — **App Themes Directory** (`/dashboard/app-themes` @ 1600×900)  
  Themes table displaying Theme Name, Primary Color swatch, Secondary Color swatch, Button Primary swatch, Button Secondary swatch, and usage counts.
- `02-create-theme-modal-4-colors.png` — **New Theme Modal with 4 Color Pickers** (`/dashboard/app-themes` @ 1600×900)  
  Interactive modal with 4 `HexColorPicker` widgets (`Primary`, `Secondary`, `Button Primary`, `Button Secondary`) allowing live visual palette configuration.

---

### 12-event-management (Event Features & Operational Controls)
- `01-event-days-sessions.png` — **Event Days & Sessions Management** (Wizard Step 2 @ 1600×900)  
  Day-by-day session timeline planner with session title, start/end times, and venue association.
- `02-event-people-media-ai-recognition.png` — **AI Face Recognition Pipeline Monitor** (`.../people-media` @ 1600×900)  
  Real-time AI face recognition monitor: processing pipeline counters (`Pending`, `Processing`, `Ready`, `Failed`), face references list, match accuracy scores, and retry triggers.
- `03-event-current-happenings.png` — **Current Happenings Configuration** (Wizard Step 6 @ 1600×900)  
  Event highlights, current happening live status banners, and ongoing announcement controls.
- `03-event-current-happenings-modal.png` — **Current Happening Quick Edit Modal** (Events List @ 1600×900)  
  Quick-edit popover dialog for toggling pre-event, ongoing, and post-event announcement banners.
- `04-event-qr-codes-and-links.png` — **Event QR Code & Join Share Modal** (Events List @ 1600×900)  
  Live SVG QR code generator, event join short link (`/join/ABHI1234`), Download SVG and Copy Link buttons.
- `05-event-watermark-branding.png` — **Gallery Watermark & Branding Preview** (Wizard Step 3 @ 1600×900)  
  Watermark upload, 9-box position grid (top-left, center, bottom-right, etc.), opacity slider, and live sample overlay preview.

---

### 13-modals-and-dialogs (Dialogs & Account Views)
- `01-event-share-qr-modal.png` — **Event Share & QR Dialog** (Modal View @ 1600×900)  
  Clean centered dialog with SVG QR code for mobile guest onboarding and join link.
- `02-current-happening-modal.png` — **Current Happening Announcement Dialog** (Modal View @ 1600×900)  
  Quick-edit dialog for live event announcement titles and phase toggles.
- `03-app-config-management.png` — **App Configuration Management** (`/dashboard/app-config` @ 1600×900)  
  Platform versioning and mandatory update policy configuration for iOS and Android.
- `04-user-profile-modal-view.png` — **User Profile & Security Page** (`/dashboard/profile` @ 1600×900)  
  Profile settings: Full name, email, phone number, Instagram handle, LinkedIn URL, and avatar upload.

---

### 14-responsive (Multi-Device Viewport Breakpoints)
- `01-dashboard-1280x800.png` — **Dashboard on Laptop (1280×800)**  
  Fluid card grid scaling; sidebar remains expanded; charts reflow to maintain readability without horizontal overflow.
- `02-dashboard-tablet-768x1024.png` — **Dashboard on Tablet Portrait (768×1024)**  
  Sidebar transforms to collapsible off-canvas overlay; stat cards stack into 2-column grid; charts stack vertically.
- `03-dashboard-mobile-390x844.png` — **Dashboard on Mobile Portrait (390×844)**  
  Full mobile single-column layout; quick action pills wrap horizontally; stat cards condense into compact cards; touch-friendly tap targets.
- `04-events-list-tablet-768x1024.png` — **Events Listing on Tablet Portrait (768×1024)**  
  Data table with responsive horizontal scroll wrapper; actions remain accessible; header controls wrap cleanly.
- `05-events-list-mobile-390x844.png` — **Events Listing on Mobile Portrait (390×844)**  
  Data table horizontal scrolling; search and filter controls stack vertically; action buttons condense.
- `06-event-create-mobile-390x844.png` — **Create Event Wizard on Mobile Portrait (390×844)**  
  Wizard step indicator collapses into horizontal scrollable pill bar; form fields stack into 100% width inputs.
- `07-venues-mobile-390x844.png` — **Venues Directory on Mobile Portrait (390×844)**  
  Venue list controls and search input stack cleanly with mobile-adapted cards.

---

## Instructions for Redesign Execution

1. All routes, components, and form handlers in this audit must be preserved in the Design 3 implementation.
2. The CSS token mappings in `src/styles/` can be updated directly to match the Design 3 palette (deep navy `#0B132B`, purple gradient accent `#7928CA` to `#4F46E5`, lavender surface `#F8FAFC`, dark surface `#111827`).
3. Form field validations and server actions must remain unchanged.
