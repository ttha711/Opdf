# Opdf Coding & UX Guidelines

## 1. No Native Browser Popup Dialogs

### Rule
**NEVER** use synchronous browser-native popups, including `alert()`, `confirm()`, or `prompt()`, for user interactions or inputs. 

### Rationale & Technical Root Cause
1. **Transient User Gesture Activation Expiration**: Modern browsers (Chrome, Edge, Safari, Firefox) restrict sensitive actions—such as programmatically launching a file selector (`input.click()`) or initiating downloads—unless they are triggered within a very short, transient user activation window immediately following a trusted physical user gesture (e.g., direct click).
2. **Gesture Token Consumption**: Native synchronous dialogs (`prompt`, `confirm`, etc.) suspend JS execution and destroy or consume the browser's transient user gesture token. As a result, any downstream programmatic invocation of file selection or bridge communication will be silently blocked by browser security sandbox engines.
3. **Flaky Behaviors**: This causes intermittent and hard-to-debug failures (e.g., file picker only opening occasionally).
4. **Poor Dark Mode Support & Design Consistency**: Native popups ignore the application's premium dark mode theme and disrupt the cohesive user experience.

### Standard Approved Pattern
Instead of native dialogs, always implement a custom React modal component under `apps/web/src/components` styled with Opdf's premium UI classes:
* Outer backdrop class: `modal-backdrop`
* Main container class: `premium-modal`
* Title icon & text container class: `premium-modal-header` > `premium-modal-title`
* Content body class: `premium-modal-body`
* Action buttons footer class: `premium-modal-footer`

All components must adapt automatically in dark mode using Opdf's standard CSS custom properties:
* Border styling: `style={{ borderColor: 'var(--border-color)' }}`
* Background colors: `style={{ background: 'var(--ui-muted-bg)' }}` or `var(--bg-toolbar)`
* Text styling: class `text-[var(--text-primary)]` or `text-[var(--text-secondary)]`
