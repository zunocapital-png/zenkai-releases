export const LANGUAGE_PROMPTS: Record<string, string> = {
  typescript: [
    "Use strict TypeScript — enable `strict: true` in tsconfig. Never use `any`; use `unknown` and narrow.",
    "Prefer `interface` for object shapes, `type` for unions/intersections/mapped types.",
    "Use `as const` for literal objects and tuples. Avoid type assertions (`as`) — prefer type guards.",
    "Handle nullability explicitly: use optional chaining `?.` and nullish coalescing `??`.",
    "Prefer `readonly` arrays and properties for immutable data. Use `Readonly<T>` for function params.",
    "Use discriminated unions with a `type` or `kind` field for state machines and tagged results.",
    "Import types with `import type { ... }` to avoid runtime overhead.",
    "For async error handling, prefer Result-like patterns or typed errors over bare try-catch when the project uses them.",
  ].join("\n"),

  python: [
    "Use type hints on all function signatures — parameters and return types. Use `from __future__ import annotations` for modern syntax.",
    "Follow PEP 8 naming: `snake_case` for functions/variables, `PascalCase` for classes, `UPPER_CASE` for constants.",
    "Use dataclasses or Pydantic models for structured data. Avoid raw dicts for domain objects.",
    "Prefer f-strings over `.format()` or `%`. Use `pathlib.Path` over `os.path`.",
    "Use `pytest` patterns: fixtures for setup, parametrize for multiple inputs, descriptive test names with `test_should_`.",
    "Handle errors with specific exception types. Never use bare `except:`. Prefer `except ValueError` over `except Exception`.",
    "Use context managers (`with`) for resource management. Use `typing.Protocol` for structural subtyping.",
    "Virtual environments: check for `pyproject.toml` (Poetry/PDM), `requirements.txt` (pip), or `setup.py` (setuptools).",
  ].join("\n"),

  rust: [
    "Use `Result<T, E>` for fallible operations and `Option<T>` for optional values. Never use `unwrap()` in library code.",
    "Prefer borrowing (`&T`, `&mut T`) over ownership transfer. Clone only when necessary and document why.",
    "Use `impl Trait` for function params when you don't need a named generic. Use `dyn Trait` only when dynamic dispatch is required.",
    "Derive common traits: `Debug`, `Clone`, `PartialEq`. Add `Serialize`/`Deserialize` when the crate uses serde.",
    "Use `thiserror` for library error types and `anyhow` for application error types (check which the project uses).",
    "Prefer iterators and combinators (`.map()`, `.filter()`, `.collect()`) over explicit loops.",
    "Lifetime annotations: start with elision rules. Add explicit lifetimes only when the compiler requires them.",
    "Use `cargo clippy` and `cargo fmt` as the quality bar. Fix all clippy warnings before declaring done.",
  ].join("\n"),

  go: [
    "Handle errors immediately after each call: `if err != nil { return ..., fmt.Errorf(\"context: %w\", err) }`. Never ignore errors.",
    "Use `fmt.Errorf` with `%w` for error wrapping. Use `errors.Is`/`errors.As` for error checking.",
    "Name return values only when it improves godoc clarity. Avoid naked returns except in very short functions.",
    "Use interfaces at the consumer site, not the producer. Keep interfaces small (1-3 methods).",
    "Use table-driven tests with `t.Run` subtests. Use `testify` only if the project already imports it.",
    "Goroutines: always ensure they can exit. Use `context.Context` for cancellation. Prefer `errgroup` for parallel work.",
    "Use `struct{}` for signal channels. Prefer `sync.Mutex` over channels for protecting shared state.",
    "Run `go vet` and `golangci-lint` to check for issues. Follow `gofmt`/`goimports` formatting.",
  ].join("\n"),

  java: [
    "Use records for immutable data carriers. Use sealed interfaces for restricted type hierarchies.",
    "Prefer Optional<T> over null returns. Never pass null as a method argument.",
    "Use try-with-resources for all AutoCloseable resources. Catch specific exceptions, never bare `Exception`.",
    "Follow Maven/Gradle conventions for project structure: `src/main/java`, `src/test/java`.",
    "Use JUnit 5 with `@Test`, `@ParameterizedTest`, `@BeforeEach`. Use AssertJ for fluent assertions if available.",
    "For Spring Boot: use constructor injection, `@ConfigurationProperties` for config, `@Transactional` on service methods.",
    "Use Lombok's `@Builder`, `@Value` only if the project already uses Lombok. Prefer records otherwise.",
    "Use `var` for local variables when the type is obvious from the right-hand side.",
  ].join("\n"),

  react: [
    "Use functional components with hooks. Never use class components for new code.",
    "Prefer `useState` for local state, `useReducer` for complex state with multiple sub-values.",
    "Memoize with `useMemo`/`useCallback` only when you have measured a performance problem. Don't prememo everything.",
    "Keep components small and focused. Extract custom hooks for reusable logic.",
    "Use TypeScript interfaces for props. Make optional props explicit with `?`. Avoid `React.FC` — declare props inline.",
    "Handle loading, error, and empty states explicitly in every data-fetching component.",
    "Use the project's state management solution (Redux, Zustand, Jotai, Context). Don't introduce a new one without asking.",
    "Follow the project's file naming convention (PascalCase components, camelCase hooks, kebab-case CSS modules).",
  ].join("\n"),

  nextjs: [
    "Use the App Router (`app/` directory) for new routes unless the project uses Pages Router (`pages/`).",
    "Default to Server Components. Add `'use client'` only when the component needs browser APIs, hooks, or event handlers.",
    "Use `generateStaticParams` for static generation. Use `revalidate` or `revalidateTag` for ISR.",
    "For data fetching in Server Components, use async/await directly. Use Route Handlers (`app/api/.../route.ts`) for API endpoints.",
    "Use `next/image` for images, `next/link` for navigation, `next/font` for font optimization.",
    "Environment variables: prefix with `NEXT_PUBLIC_` only for client-side access. Server-only vars have no prefix.",
    "Use `loading.tsx` for Suspense boundaries, `error.tsx` for error boundaries, `not-found.tsx` for 404 pages.",
    "Middleware (`middleware.ts` at root) for auth checks, redirects, and request rewriting.",
  ].join("\n"),
}

export function getLanguagePrompt(language: string): string | undefined {
  return LANGUAGE_PROMPTS[language.toLowerCase()]
}

export function detectLanguageFromConfig(configFile: string): string | undefined {
  const map: Record<string, string> = {
    "tsconfig.json": "typescript",
    "package.json": "typescript",
    "requirements.txt": "python",
    "pyproject.toml": "python",
    "setup.py": "python",
    "Pipfile": "python",
    "Cargo.toml": "rust",
    "go.mod": "go",
    "pom.xml": "java",
    "build.gradle": "java",
    "build.gradle.kts": "java",
    "next.config.js": "nextjs",
    "next.config.mjs": "nextjs",
    "next.config.ts": "nextjs",
  }
  return map[configFile]
}
