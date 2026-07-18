# Support Assistant — Design System

## 1. Atmosphere & Identity

A calm, professional support command center. Clean surfaces with subtle depth, where information hierarchy is communicated through elevation and spacing rather than heavy borders. The signature is a purple-indigo gradient accent that punctuates an otherwise neutral, airy interface — giving it a modern SaaS feel without visual noise. Dense ticket data breathes through generous whitespace and soft card segmentation.

## 2. Color

### Palette

| Role | Token | Light | Usage |
|------|-------|-------|-------|
| Surface/page | `--sp-bg-page` | #F4F5F7 | Page background |
| Surface/card | `--sp-bg-card` | #FFFFFF | Cards, panels, containers |
| Surface/hover | `--sp-bg-hover` | #F8F9FB | Subtle hover states |
| Surface/input | `--sp-bg-input` | #FFFFFF | Form inputs |
| Surface/chat-user | `--sp-bg-chat-user` | linear-gradient(135deg, #667EEA, #764BA2) | User message bubble |
| Surface/chat-assistant | `--sp-bg-chat-assistant` | #F0F2F5 | Assistant message bubble |
| Surface/elevated | `--sp-bg-elevated` | #FFFFFF | Dropdowns, modals |
| Text/primary | `--sp-text-primary` | #1A1D23 | Headlines, body |
| Text/secondary | `--sp-text-secondary` | #6B7280 | Captions, metadata |
| Text/tertiary | `--sp-text-tertiary` | #9CA3AF | Placeholders, disabled |
| Text/inverse | `--sp-text-inverse` | #FFFFFF | Text on accent bg |
| Accent/gradient-start | `--sp-accent-start` | #667EEA | Gradient start |
| Accent/gradient-end | `--sp-accent-end` | #764BA2 | Gradient end |
| Accent/hover | `--sp-accent-hover` | #5A6FD6 | Button hover |
| Border/default | `--sp-border` | #E5E7EB | Card borders, dividers |
| Border/focus | `--sp-border-focus` | #667EEA | Input focus |
| Status/open | `--sp-status-open` | #10B981 | Open status (green) |
| Status/in-progress | `--sp-status-progress` | #3B82F6 | In progress (blue) |
| Status/pending | `--sp-status-pending` | #F59E0B | Pending (amber) |
| Status/closed | `--sp-status-closed` | #9CA3AF | Closed (gray) |
| Priority/low | `--sp-priority-low` | #10B981 | Low priority |
| Priority/medium | `--sp-priority-medium` | #F59E0B | Medium priority |
| Priority/high | `--sp-priority-high` | #F97316 | High priority |
| Priority/critical | `--sp-priority-critical` | #EF4444 | Critical priority |
| Shadow/default | `--sp-shadow` | 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04) | Cards at rest |
| Shadow/elevated | `--sp-shadow-lg` | 0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04) | Elevated cards |
| Shadow/prominent | `--sp-shadow-xl` | 0 8px 30px rgba(0,0,0,0.12) | Modals, dropdowns |

### Rules
- Accent gradient is used for primary actions and user messages only. Never decorative.
- Status/priority colors are reserved for badges — never tint backgrounds with them.
- All surfaces use subtle shadows + minimal borders, never both heavily.

## 3. Typography

### Font Stack
- **Primary**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`

### Scale

| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Page title | 24px | 700 | 1.2 | SupportPage h1 |
| Section title | 18px | 600 | 1.3 | Ticket subject, form title |
| Subsection | 14px | 600 | 1.4 | Info labels, section headers |
| Body | 14px | 400 | 1.5 | Default text |
| Body/sm | 13px | 400 | 1.4 | Secondary info, descriptions |
| Caption | 12px | 500 | 1.4 | Metadata, timestamps |
| Badge | 12px | 600 | 1 | Status/priority badges |
| Overline | 11px | 600 | 1.3 | Section labels |

### Rules
- Body text never below 12px.
- Labels use `font-weight: 600` (SemiBold), not Bold.
- Timestamps and metadata use `color: var(--sp-text-tertiary)`.

## 4. Spacing & Layout

### Base Unit
All spacing derives from a base of **4px**.

| Token | Value | Usage |
|-------|-------|-------|
| --sp-1 | 4px | Tight spacing, icon adjacencies |
| --sp-2 | 8px | Badge gap, inline groups |
| --sp-3 | 12px | Form field vertical spacing |
| --sp-4 | 16px | Card horizontal padding, input padding |
| --sp-5 | 20px | Card padding |
| --sp-6 | 24px | Section spacing, layout gaps |
| --sp-8 | 32px | Large section separation |
| --sp-10 | 40px | Page padding |
| --sp-12 | 48px | Major page sections |

### Layout
- **Support page**: Full height flex column, content scrollable
- **Main layout**: 2-column grid (`1fr 2fr`) for ticket info + chat
- **Max content width**: 1400px, centered
- **Breakpoints**: 900px → single column, 768px → mobile adjustments

## 5. Components

### Card
- **Structure**: `div` with card class
- **Background**: `var(--sp-bg-card)`
- **Border**: 1px solid `var(--sp-border)`
- **Radius**: 10px
- **Shadow**: `var(--sp-shadow)`
- **Padding**: 20px

### Badge (Status / Priority)
- **Structure**: `span` with badge class
- **Radius**: 20px (pill)
- **Padding**: 4px 14px
- **Font**: 12px, 600 weight
- **States**: default only (informational, not interactive)

### Button — Primary
- **Background**: linear-gradient(135deg, var(--sp-accent-start), var(--sp-accent-end))
- **Color**: white
- **Radius**: 8px
- **Padding**: 10px 20px
- **Font**: 14px, 600 weight
- **States**: default, hover (translateY(-1px) + shadow), active (translateY(0)), disabled (opacity 0.5)

### Button — Secondary (Outline)
- **Background**: transparent
- **Border**: 2px solid `var(--sp-border)`
- **Color**: `var(--sp-text-secondary)`
- **Radius**: 8px
- **Padding**: 10px 20px
- **States**: hover (border/color darkens)

### Form Input
- **Structure**: `input` / `textarea` / `select`
- **Border**: 2px solid `var(--sp-border)`
- **Radius**: 8px
- **Padding**: 10px 14px
- **Font**: 14px
- **States**: default, focus (border → accent), disabled (gray bg)

### Chat Message
- **Structure**: `div` aligned left (assistant) / right (user)
- **Max width**: 80%
- **Radius**: 12px with directional flatten (4px on the originating side)
- **User**: accent gradient bg, white text
- **Assistant**: light gray bg, dark text
- **Animation**: fadeIn + translateY 0.2s on mount

### Chat Input
- **Structure**: contained row with text input + send button
- **Input radius**: 20px (pill)
- **Send button**: primary gradient, pill shape

### Selector Row (TicketSelector)
- **Structure**: flex row with select + button
- **Select**: full-width with subtle border
- **Button**: primary gradient "Новый тикет"

### Ticket Info Table
- **Structure**: unstyled table with rows
- **Label width**: 120px
- **Rows separated**: 1px solid very light border

### Skeleton Loader
- **Structure**: pulsing placeholder shapes
- **Animation**: shimmer effect
- **Radius**: 8px
- **Color**: `var(--sp-bg-hover)`

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150ms | ease-in-out | Color transitions, border focus |
| Standard | 200ms | ease | Button hover, scale transforms |
| Emphasis | 300ms | cubic-bezier(0.16, 1, 0.3, 1) | Card entrance, panel slide |

### Rules
- Only animate `transform` and `opacity`. Never animate layout properties.
- Every interactive element has hover + active + focus states.
- `prefers-reduced-motion` disables all non-essential animation.
- Chat messages fade in with `translateY(8px) → 0` on mount.

### Animations
- `supportFadeIn`: opacity 0→1, translateY(8px→0), 0.2s
- `skeletonPulse`: shimmer sweep across skeleton loaders
- `spin`: loading spinner rotation

## 7. Depth & Surface

### Strategy
**Mixed** — cards use subtle shadows + minimal borders.

| Level | Recipe | Usage |
|-------|--------|-------|
| Page bg | Single flat fill `var(--sp-bg-page)` | Behind all cards |
| Card default | White bg + 1px border + subtle shadow | Ticket info, chat, forms |
| Card elevated | White bg + deeper shadow | Active/interactive states |
| Button | Gradient surface + shadow on hover | Primary actions |
| Glass separator | 1px border or thin spacer | Divides sections |

### Rules
- Cards never have both heavy borders and heavy shadows — one or the other.
- Hover elevation uses `translateY(-1px)` + shadow increase.
- The page background is deliberately cooler than card backgrounds to create contrast.

---

*This design system was extracted from the existing Support Assistant UI and codified for consistency.*
