# OpenSimperfi - AI Agent Guide

This document provides AI assistants with comprehensive guidelines for working on the OpenSimperfi codebase.

**Stack**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui + Dexie.js

## Build, Lint & Test Commands

```bash
# Development
npm install              # Install dependencies
npm run dev              # Start dev server (http://localhost:5173)

# Building
npm run build            # Type-check with tsc, then build with vite
npm run preview          # Preview production build locally

# Linting
npm run lint             # Run ESLint on .ts and .tsx files

# Deployment
npm run deploy           # Build and deploy to GitHub Pages
```

**Note**: This project currently has no test suite. When adding tests in the future, document the commands here.

## Code Style Guidelines

### Import Organization
Organize imports in this order:
1. External libraries (React, third-party packages)
2. Internal aliases (`@/lib`, `@/components`, `@/hooks`, `@/pages`)
3. Relative imports (if necessary)
4. Type-only imports last (if needed)

```tsx
// Example
import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LedgerEntry, Trade } from '@/lib/db';
import { useLivePrices } from '@/hooks/use-live-prices';
import { Button } from '@/components/ui/button';
import { formatCurrency, cn } from '@/lib/utils';
```

### TypeScript Guidelines

**Strict Mode**: This project uses strict TypeScript (`strict: true` in tsconfig.json).

- **Types Over Interfaces**: Prefer `type` for object shapes unless extending is needed
- **Explicit Return Types**: Not required but recommended for exported functions
- **Optional Chaining**: Use `?.` and `??` for safer property access
- **Type Inference**: Let TypeScript infer when obvious, but annotate function parameters
- **No `any`**: Avoid `any` type; use `unknown` if truly needed
- **Array Types**: Use `Type[]` over `Array<Type>` for readability

```tsx
// Good
type AssetHolding = {
  ticker: string;
  amount: number;
  avgBuyPrice: number;
};

const calculateHoldings = (entries: LedgerEntry[]): AssetHolding[] => {
  // ...
};

// Avoid
interface AssetHolding { ... }  // Use type unless extending
const calculateHoldings = (entries: any) => { ... };  // No any
```

### Naming Conventions

- **Components**: PascalCase (`TradeForm`, `Dashboard`)
- **Files**: Match component name (`TradeForm.tsx`, `Dashboard.tsx`)
- **Hooks**: camelCase with `use` prefix (`useLivePrices`, `useAccountBalance`)
- **Utilities**: camelCase (`formatCurrency`, `calculateHoldings`)
- **Constants**: UPPER_SNAKE_CASE (`DB_LIST_KEY`, `DEFAULT_DB_ID`)
- **Types/Interfaces**: PascalCase (`LedgerEntry`, `TradeFormValues`)
- **Database Tables**: camelCase (`accounts`, `ledger`, `trades`)

### Formatting Conventions

- **Indentation**: 2 spaces (not tabs)
- **Quotes**: Double quotes `"` for strings, JSX attributes
- **Semicolons**: Required (ESLint enforces this)
- **Line Length**: No strict limit, but aim for readability (~100-120 chars)
- **Trailing Commas**: Use for multi-line arrays/objects

### React Patterns

**Function Components**: Always use function declarations with explicit types:
```tsx
export function ComponentName({ prop }: { prop: string }) {
  // ...
}
```

**Hooks**: 
- Use `React.useState`, `React.useEffect`, etc. (namespace imports)
- Custom hooks go in `src/hooks/`
- Always declare dependencies correctly in `useEffect`

**Props**:
- Inline type for simple props: `{ onSuccess: () => void }`
- Separate type for complex props: `type ComponentProps = { ... }`

### State Management

- **Dexie Live Queries**: Use `useLiveQuery()` for reactive database updates
- **React State**: Use `useState` for local UI state
- **Context**: Use for theme (already implemented in `theme-provider.tsx`)
- **Forms**: Use React Hook Form + Zod for validation

### Error Handling

- **Database Operations**: Always wrap in try-catch or handle promise rejections
- **API Calls**: Wrap fetch calls in try-catch, handle non-ok responses
- **User Feedback**: Use browser `confirm()` for destructive actions, `alert()` for errors (consider toast library in future)

```tsx
// Good
const handleDelete = async (id: number) => {
  if (!confirm('Are you sure?')) return;
  
  try {
    await db.transaction('rw', db.trades, db.ledger, async () => {
      await db.trades.delete(id);
      await db.ledger.where('tradeId').equals(id).delete();
    });
  } catch (error) {
    console.error('Delete failed:', error);
    alert('Failed to delete transaction');
  }
};
```

### Styling with Tailwind

- **Use `cn()` utility**: Import from `@/lib/utils` to merge class names conditionally
- **Dark Mode**: Always provide dark mode variants using `dark:` prefix
- **Color Guidelines** (critical for consistency):
  - Positive/Green: `text-green-600 dark:text-green-400`
  - Negative/Red: `text-red-500 dark:text-red-400`
  - Warning/Amber: `text-amber-600 dark:text-amber-400`
  - Muted text: `text-muted-foreground`
- **Responsive Design**: Use `sm:`, `md:`, `lg:` breakpoints (mobile-first)
  - `md:` (768px) is primary breakpoint for desktop/mobile split

### shadcn/ui Components

**Installation**: Always use the CLI to add new components:
```bash
npx shadcn@latest add button
npx shadcn@latest add card dialog input
```

**Usage**: Components are in `src/components/ui/`, import with `@/components/ui/*`

**Customization**: Components are copied to your codebase and can be modified directly

**Already Installed**: button, card, input, label, textarea, dialog, dropdown-menu, select, table, badge, skeleton, command

## Architecture Patterns

### Database (Dexie)
- **Atomic Updates**: Always use `db.transaction('rw', ...)`  for multi-table operations
- **Live Queries**: Prefer `useLiveQuery()` for reactive data over manual state updates
- **Indexes**: Defined in `src/lib/db.ts` schema

### Responsive Design
- **Dual Layouts**: Desktop tables (`hidden md:table`) + Mobile cards (`md:hidden`)
- **No Horizontal Scroll**: Never rely on horizontal scrolling on mobile
- **Touch Targets**: Minimum 44x44px for buttons on mobile

### File Organization
- `/src/lib` - Database, utilities, type definitions
- `/src/components` - Reusable UI components
- `/src/components/ui` - shadcn/ui primitives
- `/src/pages` - Top-level route components
- `/src/hooks` - Custom React hooks

## Common Gotchas

1. **Dexie Transactions**: Must be atomic for related changes (e.g., deleting trade + ledger entries)
2. **Theme Flash**: Theme loads from localStorage, may flash on mount
3. **Dialog Heights**: Must be fixed or content changes cause resize issues
4. **IndexedDB Limits**: Mobile Safari has storage quotas - warn users if approaching limits
5. **Type Assertions**: Avoid `as` casts unless absolutely necessary; fix types at source

## When Making Changes

1. **Test dark mode** after any UI changes
2. **Test mobile viewport** (375px width minimum)
3. **Run `npm run build`** before committing to catch type errors
4. **Check responsive breakpoints** at 640px, 768px, 1024px
5. **Verify no console errors** in browser DevTools

---

**Last Updated**: 2026-01-16  
**Version**: 0.1.0
