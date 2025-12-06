# Project Overview
This project is a Vite-based Progressive Web App (PWA) for splitting SVG patterns into printable tiles, exporting them as PDFs, and providing scale verification for physical output. The app is written in TypeScript and uses modular architecture for maintainability and extensibility.

## Key Technologies
- **Vite**: Fast build tool and dev server.
- **TypeScript**: All logic and modules are typed for safety and clarity.
- **Tailwind CSS**: Utility-first CSS for rapid UI development.
- **jsPDF & svg2pdf.js**: PDF generation and SVG conversion.
- **PWA**: Service worker and offline support.

## Main Files & Structure
- `index.html`: Main UI markup, migrated from prototype.
- `src/style.css`: All custom styles, migrated from prototype.
- `src/main.ts`: App entry point, wires up UI, event listeners, and PDF logic.
- `src/pattern-splitter.ts`: Core logic for SVG splitting, tiling, diamond marks, scale verification lines, and PDF export.
- `src/pwa.ts`: Handles PWA toast and service worker logic.
- `src/svg2pdf.d.ts`: Type declarations for svg2pdf.js.
- `public/`: Static assets.

## Implementation Details
- **SVG Upload & Validation**: Only SVG files are accepted. Error feedback is shown for invalid files, margins, or paper sizes.
- **Grid Preview**: Shows how the SVG will be split into tiles, with scale verification lines (ruler) for physical checking.
- **PDF Export**: Uses dynamic imports for PDF libraries. Progress bar and feedback are provided during export.
- **Mobile Responsiveness**: UI is tested and tweaked for mobile devices.
- **PWA Toast**: Can be styled or removed to match prototype UI.

## Learned Lessons
- Always migrate features and UI in modular steps, validating parity with the prototype.
- Place all function and variable declarations at the top-level scope to avoid TypeScript errors.
- Use clear error feedback for all user input and file validation.
- Keep event listeners and DOM queries outside of function bodies for maintainability.
- Remove all duplicate or orphaned code blocks after major refactors.
- Document architectural decisions and migration steps for future agents.

## Agent Guidance
- **Before editing:** Always check for duplicate declarations and misplaced code blocks.
- **When migrating features:** Validate UI and logic parity with the prototype.
- **For new features:** Add them as modular functions in `src/pattern-splitter.ts` and wire up in `src/main.ts`.
- **For bug fixes:** Check for scope issues, stray brackets, and event listener placement.
- **For UI changes:** Update `src/style.css` and test on mobile and desktop.
- **For PWA logic:** Update `src/pwa.ts` and ensure service worker registration is correct.

## Next Steps
- Continue to improve error feedback and validation.
- Refactor for further modularity if needed.
- Keep this file updated with new lessons and architectural changes.
