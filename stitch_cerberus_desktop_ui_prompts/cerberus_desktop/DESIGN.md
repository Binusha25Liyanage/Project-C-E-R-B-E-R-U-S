---
name: Cerberus Desktop
colors:
  surface: '#f8faf9'
  surface-dim: '#d9dada'
  surface-bright: '#f8faf9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f3'
  surface-container: '#edeeee'
  surface-container-high: '#e7e8e8'
  surface-container-highest: '#e1e3e2'
  on-surface: '#191c1c'
  on-surface-variant: '#584142'
  inverse-surface: '#2e3131'
  inverse-on-surface: '#eff1f0'
  outline: '#8b7171'
  outline-variant: '#dfbfc0'
  surface-tint: '#ac2f43'
  primary: '#7b0523'
  on-primary: '#ffffff'
  primary-container: '#9c2338'
  on-primary-container: '#ffb2b7'
  inverse-primary: '#ffb2b7'
  secondary: '#5e5e62'
  on-secondary: '#ffffff'
  secondary-container: '#e0dfe3'
  on-secondary-container: '#626266'
  tertiary: '#3b3c3a'
  on-tertiary: '#ffffff'
  tertiary-container: '#525351'
  on-tertiary-container: '#c7c7c4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdadb'
  primary-fixed-dim: '#ffb2b7'
  on-primary-fixed: '#40000d'
  on-primary-fixed-variant: '#8b152d'
  secondary-fixed: '#e3e2e6'
  secondary-fixed-dim: '#c7c6ca'
  on-secondary-fixed: '#1b1b1f'
  on-secondary-fixed-variant: '#46464a'
  tertiary-fixed: '#e3e2e0'
  tertiary-fixed-dim: '#c7c6c4'
  on-tertiary-fixed: '#1a1c1a'
  on-tertiary-fixed-variant: '#464745'
  background: '#f8faf9'
  on-background: '#191c1c'
  surface-variant: '#e1e3e2'
typography:
  h1:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  h2:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  h3:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-table:
    fontFamily: IBM Plex Mono
    fontSize: 13px
    fontWeight: '450'
    lineHeight: 18px
  stamp-label:
    fontFamily: IBM Plex Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.08em
  label-caps:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar-width: 260px
  gutter: 16px
  margin-page: 32px
  stack-xs: 4px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style
The design system is built on a "Digital Ledger" metaphor, blending the rigid efficiency of high-end productivity software with the tactile reliability of archival paperwork. It is designed for professional environments where information density and task completion are paramount.

The aesthetic follows a **Tactile-Corporate** hybrid. It utilizes a "Black Mercury" sidebar to represent the machine's control center, while the main workspace utilizes "Paper" tones to evoke the feeling of a physical ledger. Visual interest is driven by "Stamp" badges—elements that appear as if physically imprinted on the surface—and high-contrast accents in "Cherry Alloy." The overall mood is authoritative, grounded, and intensely functional.

## Colors
This design system employs a split-surface strategy. 
- **Sidebar (Black Mercury):** A deep, near-black environment for navigation. It uses subtle increments of grey for state changes to maintain a "stealth" appearance.
- **Main Workspace (Paper):** Uses a warm, off-white base to reduce eye strain during long periods of data entry. Panels should use the slightly darker `#F1EFE9` to create structural hierarchy without relying on shadows.
- **Primary Accent (Cherry Alloy):** Reserved for high-priority actions, active indicators, and the brand mark. It represents the "ink" of the system's authority.
- **Stamp Palette:** Muted yet clear tones used exclusively for status indicators, mimicking the ink of a rubber stamp.

## Typography
Typography is technical and precise.
- **Space Grotesk** is used for headers and the wordmark to provide a modern, geometric frame.
- **IBM Plex Sans** handles the bulk of interface copy, chosen for its humanist legibility and professional tone.
- **IBM Plex Mono** is mandatory for all numerical data, timestamps, and ID strings to ensure perfect tabular alignment in the ledger.
- **Sinhala Support:** In multi-language contexts, fallback to Noto Sans Sinhala, maintaining matching x-heights with IBM Plex Sans where possible.

## Layout & Spacing
The layout follows a **Fixed-Sidebar Fluid-Workspace** model. 
- The sidebar is fixed at 260px, providing a constant anchor for navigation.
- The workspace uses a dense grid system with 16px gutters.
- Information density is a priority; vertical spacing is tight (8px or 16px) to maximize the visible data on a single screen without scrolling.
- Elements should be aligned to a strict 4px baseline grid to maintain the "ledger" feel.

## Elevation & Depth
This design system avoids soft ambient shadows. Instead, it uses **Tonal Layering** and **Crisp Outlines** to define depth.
- **Level 0 (Base):** The #FBFAF7 paper background.
- **Level 1 (Panels):** The #F1EFE9 surfaces used for grouping content, defined by a 1px border (#DEDACE).
- **Modals:** These sit on the highest tier, utilizing the paper background but surrounded by a high-contrast 2px border or a very tight, dark "ink" shadow (4px blur, 20% opacity) to distinguish them from the workspace.
- **Sidebar Elements:** Use inner-borders and subtle value shifts in the dark spectrum to indicate hierarchy.

## Shapes
The shape language is predominantly **Soft (0.25rem)**. 
- Standard UI components (Inputs, Buttons) use a 4px radius to maintain a professional, slightly rigid appearance.
- **Tabs:** Use "Browser-style" rounding where the top corners are rounded (8px) and the bottom corners flare out to merge seamlessly into the content panel below.
- **Stamp Badges:** Retain a sharp, rectangular profile with a 2px radius, but are defined more by their rotation than their roundness.

## Components
- **Stamp Badge:** These must be rotated exactly -2 degrees. They feature a 1.5px solid border matching the text color. The text must be uppercase with tight letter-spacing to mimic a physical ink stamp.
- **Buttons:** 
  - *Primary:* Solid Cherry Alloy with white text. No gradient.
  - *Outline:* 1.5px border in Cherry Alloy with a transparent background.
  - *Danger:* Text-only, using the Red #B23A2E, reserved for destructive ledger entries.
- **Input Fields:** Rectangular with a 1px #DEDACE border. On focus, the border changes to Cherry Alloy. Background is always white (#FFFFFF) to pop against the paper workspace.
- **Tabs:** Positioned at the top of panels. The active tab should share the exact background color of the panel it controls (#F1EFE9), creating a "folder tab" effect.
- **Data Tables:** Use IBM Plex Mono for all cell content. Row separators should be 1px solid #DEDACE. Use zebra-striping with #F1EFE9 for high-density lists.
- **Sidebar Items:** Icons should be simple, linear, and 20px in size. Active states are indicated by a 3px vertical Cherry Alloy stripe on the far left.