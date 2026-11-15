# PROJECT & CONTEXT RULES (STRICTLY ENFORCED)

You must minimize token usage, latency, and unnecessary file reads while maintaining a clean, modular codebase. Follow these rules for EVERY task.

---

## 1. Progressive Context Discovery (Tree-First Protocol)
Before editing code or running searches, follow this strict 3-step discovery order:

1. **Phase 1: Directory Tree & File Names Only (Zero Content Reads)**
   - **DO NOT** read full file contents, run broad `grep` searches across the whole codebase, or inspect `node_modules` / build artifacts at the start of a task.
   - **FIRST**, inspect ONLY the directory structure and file names (`tree` / directory listing), ignoring `node_modules`, `.git`, `dist`, `build`, and lockfiles.
   - Deduce the 1–3 most probable target files based strictly on folder names, file names, and architectural conventions.

2. **Phase 2: Targeted Inspection (Minimal Scope)**
   - Read **ONLY** the 1–3 high-probability files identified in Phase 1.
   - If an existing file is over 250 lines, inspect its imports, exports, and function signatures first instead of reading unrelated sections.
   - **Expand scope ONLY if** a required dependency, type definition, or imported module is missing. Follow direct `import` paths rather than guessing.

3. **Phase 3: Execution & Verification**
   - Execute the requested change immediately without further exploratory reads.
   - Run targeted typechecks/linters on the modified files if needed.

---

## 2. Code Modularity & File Size Limits (Clean Architecture)
- **Strict File Length Limit:** Keep files concise and focused—aim for **under 200 lines** per file, and **never exceed 250–300 lines** unless strictly unavoidable (e.g., complex type definitions or static config).
- **Single Responsibility Principle (SRP):** Each file must have one clear purpose. Never mix UI rendering, API/data fetching, state management, and heavy utility logic in the same file.
- **Proactive Splitting:**
  - When creating new features, split them into logical modules from the start (e.g., `components/`, `hooks/`, `services/`, `utils/`, `types/`).
  - If an edit pushes an existing file over ~250 lines, extract helper functions, sub-components, or custom hooks into separate, well-named files in the appropriate directory.
- **Descriptive Naming:** File names must clearly reflect their exact responsibility (e.g., `useMapLayers.ts`, `fetchGeoData.ts`, `LayerToggle.tsx`) so Phase 1 file-name discovery always works reliably.

---

## 3. Hard Prohibitions
- **NEVER** read files inside `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, or large static data files (`.geojson`, `.json` datasets, `.svg`) unless explicitly instructed to edit that exact data file.
- **NEVER** create monolithic "god files" or dump multiple unrelated components/functions into a single file.
- **NEVER** summarize or explain files you were not asked to modify. Keep responses concise and action-oriented.