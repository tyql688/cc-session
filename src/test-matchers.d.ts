// Makes the @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveClass, toHaveAttribute, ...) visible to TypeScript inside component
// render tests. The runtime registration happens in vitest.setup.ts; this
// import only pulls in the `declare module "vitest"` augmentation so tsc knows
// about the matchers. Kept under src/ because tsconfig only includes src/.
import "@testing-library/jest-dom/vitest";
