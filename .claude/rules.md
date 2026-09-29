# Rules

## Code Philosophy
- **Shortest is best** - Minimize code while maintaining clarity
- **Simplest is best** - Avoid over-engineering
- **Clean code** - Self-documenting, readable, maintainable

## React Standards
- Always use functional components with hooks
- Use TypeScript with strict mode enabled
- Avoid class components entirely
- No prop drilling - use Context or state management
- One component per file (except for tiny helper components)

## Naming Conventions
- Components: PascalCase (e.g., `UserProfile.tsx`)
- Hooks: camelCase with 'use' prefix (e.g., `useAuth.ts`)
- Utilities: camelCase (e.g., `formatDate.ts`)
- Constants: UPPER_SNAKE_CASE
- Files: match the export name

## Component Structure
```tsx
// 1. Imports
// 2. Types/Interfaces
// 3. Component definition
// 4. Exports (default export at bottom)
```

## Forbidden Patterns
- ❌ No `any` type (use `unknown` if needed)
- ❌ No inline styles (use Tailwind or styled-components)
- ❌ No large useEffect blocks (split or extract)
- ❌ No deeply nested components (max 3 levels)
- ❌ No magic numbers (use named constants)
- ❌ No console.logs in production code

## Required Patterns
- ✅ Early returns for guards and conditions
- ✅ Destructure props immediately
- ✅ Extract repeated JSX into components
- ✅ Use TypeScript generics for reusable components
- ✅ Handle loading, error, and empty states
- ✅ Use semantic HTML elements

## File Organization
```
src/
├── components/     # Reusable UI components
├── features/       # Feature-based modules
├── hooks/          # Custom hooks
├── utils/          # Helper functions
├── types/          # TypeScript types
├── services/       # API calls
└── pages/          # Route components
```

## Performance Rules
- Always add keys to mapped elements
- Memoize expensive calculations
- Debounce user inputs
- Lazy load routes
- Optimize images and assets

## Latest Standards (2024-2025)
- Use React 18+ features (useTransition, useDeferredValue)
- Use React Server Components when applicable
- Implement Suspense for async components
- Use the new JSX transform (no React import needed)
- Prefer Vite over Create React App
