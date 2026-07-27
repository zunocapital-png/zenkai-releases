import { Effect, Schema } from "effect"
import * as path from "path"
import * as fs from "fs/promises"

export type Language = "typescript" | "python" | "go" | "rust" | "java" | "dart" | "javascript"

export type Framework =
  | "react"
  | "nextjs"
  | "express"
  | "fastapi"
  | "django"
  | "flutter"
  | "electron"
  | "cli"
  | "none"

export type ProjectType = {
  language: Language
  framework: Framework
  packageManager?: string
  entryPoint?: string
}

type FileEntry = {
  path: string
  content: string
}

type ProjectStructure = {
  name: string
  language: Language
  framework: Framework
  files: FileEntry[]
  directories: string[]
}

export class ScaffoldError extends Schema.TaggedErrorClass<ScaffoldError>()("ScaffoldError", {
  reason: Schema.String,
}) {}

const GITIGNORE_COMMON = `node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
coverage/
`

const GITIGNORE_PYTHON = `__pycache__/
*.py[cod]
*$py.class
.venv/
venv/
env/
*.egg-info/
dist/
build/
.env
.env.local
*.log
.DS_Store
coverage/
htmlcov/
.pytest_cache/
.mypy_cache/
`

const GITIGNORE_GO = `bin/
*.exe
*.dll
*.so
*.dylib
*.test
*.out
vendor/
.env
*.log
.DS_Store
`

const GITIGNORE_RUST = `target/
Cargo.lock
*.pdb
.env
*.log
.DS_Store
`

const GITIGNORE_JAVA = `*.class
*.jar
*.war
*.ear
target/
build/
.gradle/
.env
*.log
.DS_Store
.idea/
*.iml
`

const GITIGNORE_DART = `.dart_tool/
.packages
build/
.env
*.log
.DS_Store
pubspec.lock
`

function gitignoreFor(language: Language): string {
  switch (language) {
    case "python":
      return GITIGNORE_PYTHON
    case "go":
      return GITIGNORE_GO
    case "rust":
      return GITIGNORE_RUST
    case "java":
      return GITIGNORE_JAVA
    case "dart":
      return GITIGNORE_DART
    default:
      return GITIGNORE_COMMON
  }
}

function reactTemplate(name: string): ProjectStructure {
  return {
    name,
    language: "typescript",
    framework: "react",
    directories: ["src", "src/components", "src/hooks", "src/utils", "public"],
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name,
            version: "0.1.0",
            private: true,
            type: "module",
            scripts: {
              dev: "vite",
              build: "tsc && vite build",
              preview: "vite preview",
            },
            dependencies: {
              react: "^19.0.0",
              "react-dom": "^19.0.0",
            },
            devDependencies: {
              "@types/react": "^19.0.0",
              "@types/react-dom": "^19.0.0",
              "@vitejs/plugin-react": "^4.3.0",
              typescript: "^5.7.0",
              vite: "^6.0.0",
            },
          },
          null,
          2,
        ),
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              lib: ["ES2022", "DOM", "DOM.Iterable"],
              module: "ESNext",
              moduleResolution: "bundler",
              jsx: "react-jsx",
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true,
              outDir: "dist",
            },
            include: ["src"],
          },
          null,
          2,
        ),
      },
      {
        path: "vite.config.ts",
        content: `import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
})
`,
      },
      {
        path: "index.html",
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
      },
      {
        path: "src/main.tsx",
        content: `import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
      },
      {
        path: "src/App.tsx",
        content: `export function App() {
  return <div><h1>${name}</h1></div>
}
`,
      },
      { path: ".gitignore", content: gitignoreFor("typescript") },
    ],
  }
}

function nextjsTemplate(name: string): ProjectStructure {
  return {
    name,
    language: "typescript",
    framework: "nextjs",
    directories: ["app", "app/api", "components", "lib", "public"],
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name,
            version: "0.1.0",
            private: true,
            scripts: {
              dev: "next dev",
              build: "next build",
              start: "next start",
              lint: "next lint",
            },
            dependencies: {
              next: "^15.0.0",
              react: "^19.0.0",
              "react-dom": "^19.0.0",
            },
            devDependencies: {
              "@types/node": "^22.0.0",
              "@types/react": "^19.0.0",
              "@types/react-dom": "^19.0.0",
              typescript: "^5.7.0",
            },
          },
          null,
          2,
        ),
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              lib: ["dom", "dom.iterable", "esnext"],
              allowJs: true,
              skipLibCheck: true,
              strict: true,
              noEmit: true,
              esModuleInterop: true,
              module: "esnext",
              moduleResolution: "bundler",
              resolveJsonModule: true,
              isolatedModules: true,
              jsx: "preserve",
              incremental: true,
              plugins: [{ name: "next" }],
              paths: { "@/*": ["./*"] },
            },
            include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
            exclude: ["node_modules"],
          },
          null,
          2,
        ),
      },
      {
        path: "next.config.ts",
        content: `import type { NextConfig } from "next"

const nextConfig: NextConfig = {}

export default nextConfig
`,
      },
      {
        path: "app/layout.tsx",
        content: `import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "${name}",
  description: "${name}",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`,
      },
      {
        path: "app/page.tsx",
        content: `export default function Home() {
  return <main><h1>${name}</h1></main>
}
`,
      },
      {
        path: "app/api/health/route.ts",
        content: `import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ status: "ok" })
}
`,
      },
      { path: ".gitignore", content: `.next/\n${gitignoreFor("typescript")}` },
    ],
  }
}

function expressTemplate(name: string): ProjectStructure {
  return {
    name,
    language: "typescript",
    framework: "express",
    directories: ["src", "src/routes", "src/middleware", "src/models"],
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name,
            version: "0.1.0",
            private: true,
            type: "module",
            scripts: {
              dev: "tsx watch src/index.ts",
              build: "tsc",
              start: "node dist/index.js",
            },
            dependencies: {
              express: "^5.0.0",
            },
            devDependencies: {
              "@types/express": "^5.0.0",
              "@types/node": "^22.0.0",
              tsx: "^4.0.0",
              typescript: "^5.7.0",
            },
          },
          null,
          2,
        ),
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              module: "ESNext",
              moduleResolution: "bundler",
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              outDir: "dist",
              rootDir: "src",
            },
            include: ["src"],
          },
          null,
          2,
        ),
      },
      {
        path: "src/index.ts",
        content: `import express from "express"
import { healthRouter } from "./routes/health"

const app = express()
const port = process.env.PORT || 3000

app.use(express.json())
app.use("/health", healthRouter)

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`)
})
`,
      },
      {
        path: "src/routes/health.ts",
        content: `import { Router } from "express"

export const healthRouter = Router()

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" })
})
`,
      },
      { path: ".gitignore", content: gitignoreFor("typescript") },
    ],
  }
}

function fastapiTemplate(name: string): ProjectStructure {
  return {
    name,
    language: "python",
    framework: "fastapi",
    directories: ["app", "app/routers", "app/models", "app/schemas", "tests"],
    files: [
      {
        path: "requirements.txt",
        content: `fastapi>=0.115.0
uvicorn[standard]>=0.32.0
pydantic>=2.10.0
`,
      },
      {
        path: "app/__init__.py",
        content: "",
      },
      {
        path: "app/main.py",
        content: `from fastapi import FastAPI
from app.routers import health

app = FastAPI(title="${name}")

app.include_router(health.router)


@app.get("/")
async def root():
    return {"message": "${name}"}
`,
      },
      {
        path: "app/routers/__init__.py",
        content: "",
      },
      {
        path: "app/routers/health.py",
        content: `from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/")
async def health_check():
    return {"status": "ok"}
`,
      },
      {
        path: "app/models/__init__.py",
        content: "",
      },
      {
        path: "app/schemas/__init__.py",
        content: "",
      },
      {
        path: "tests/__init__.py",
        content: "",
      },
      {
        path: "tests/test_main.py",
        content: `from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200


def test_health():
    response = client.get("/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
`,
      },
      { path: ".gitignore", content: gitignoreFor("python") },
    ],
  }
}

function djangoTemplate(name: string): ProjectStructure {
  const slug = name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()
  return {
    name,
    language: "python",
    framework: "django",
    directories: [slug, slug + "/templates", "static", "apps"],
    files: [
      {
        path: "requirements.txt",
        content: `django>=5.1
gunicorn>=23.0
`,
      },
      {
        path: "manage.py",
        content: `#!/usr/bin/env python
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "${slug}.settings")
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
`,
      },
      {
        path: `${slug}/__init__.py`,
        content: "",
      },
      {
        path: `${slug}/settings.py`,
        content: `import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")
DEBUG = os.environ.get("DEBUG", "True") == "True"
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "${slug}.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "${slug}" / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "${slug}.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

STATIC_URL = "static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
`,
      },
      {
        path: `${slug}/urls.py`,
        content: `from django.contrib import admin
from django.urls import path
from django.http import JsonResponse


def health(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
]
`,
      },
      {
        path: `${slug}/wsgi.py`,
        content: `import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "${slug}.settings")
application = get_wsgi_application()
`,
      },
      { path: ".gitignore", content: `db.sqlite3\n${gitignoreFor("python")}` },
    ],
  }
}

function flutterTemplate(name: string): ProjectStructure {
  const slug = name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()
  return {
    name,
    language: "dart",
    framework: "flutter",
    directories: ["lib", "lib/screens", "lib/widgets", "lib/models", "test"],
    files: [
      {
        path: "pubspec.yaml",
        content: `name: ${slug}
description: ${name}
publish_to: "none"
version: 1.0.0+1

environment:
  sdk: ">=3.5.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.8

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0

flutter:
  uses-material-design: true
`,
      },
      {
        path: "lib/main.dart",
        content: `import 'package:flutter/material.dart';
import 'package:${slug}/screens/home_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '${name}',
      theme: ThemeData(
        colorSchemeSeed: Colors.blue,
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}
`,
      },
      {
        path: "lib/screens/home_screen.dart",
        content: `import 'package:flutter/material.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('${name}')),
      body: const Center(child: Text('${name}')),
    );
  }
}
`,
      },
      {
        path: "test/widget_test.dart",
        content: `import 'package:flutter_test/flutter_test.dart';
import 'package:${slug}/main.dart';

void main() {
  testWidgets('App renders', (tester) async {
    await tester.pumpWidget(const MyApp());
    expect(find.text('${name}'), findsOneWidget);
  });
}
`,
      },
      { path: ".gitignore", content: gitignoreFor("dart") },
    ],
  }
}

function electronTemplate(name: string): ProjectStructure {
  return {
    name,
    language: "typescript",
    framework: "electron",
    directories: ["src", "src/main", "src/renderer", "src/preload"],
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name,
            version: "0.1.0",
            private: true,
            main: "dist/main/index.js",
            scripts: {
              dev: "electron .",
              build: "tsc",
              start: "electron .",
            },
            dependencies: {
              electron: "^33.0.0",
            },
            devDependencies: {
              "@types/node": "^22.0.0",
              typescript: "^5.7.0",
            },
          },
          null,
          2,
        ),
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              module: "CommonJS",
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              outDir: "dist",
              rootDir: "src",
            },
            include: ["src"],
          },
          null,
          2,
        ),
      },
      {
        path: "src/main/index.ts",
        content: `import { app, BrowserWindow } from "electron"
import * as path from "path"

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadFile(path.join(__dirname, "../renderer/index.html"))
}

app.whenReady().then(createWindow)

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
`,
      },
      {
        path: "src/preload/index.ts",
        content: `import { contextBridge } from "electron"

contextBridge.exposeInMainWorld("api", {
  version: process.versions.electron,
})
`,
      },
      {
        path: "src/renderer/index.html",
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'" />
    <title>${name}</title>
  </head>
  <body>
    <h1>${name}</h1>
  </body>
</html>
`,
      },
      { path: ".gitignore", content: gitignoreFor("typescript") },
    ],
  }
}

function cliTemplate(name: string): ProjectStructure {
  return {
    name,
    language: "typescript",
    framework: "cli",
    directories: ["src", "src/commands"],
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name,
            version: "0.1.0",
            private: true,
            type: "module",
            bin: { [name]: "dist/index.js" },
            scripts: {
              dev: "tsx src/index.ts",
              build: "tsc",
              start: "node dist/index.js",
            },
            devDependencies: {
              "@types/node": "^22.0.0",
              tsx: "^4.0.0",
              typescript: "^5.7.0",
            },
          },
          null,
          2,
        ),
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              module: "ESNext",
              moduleResolution: "bundler",
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              outDir: "dist",
              rootDir: "src",
            },
            include: ["src"],
          },
          null,
          2,
        ),
      },
      {
        path: "src/index.ts",
        content: `#!/usr/bin/env node

const args = process.argv.slice(2)
const command = args[0]

if (!command || command === "help") {
  console.log(\`Usage: ${name} <command>\\n\\nCommands:\\n  help    Show this help message\`)
  process.exit(0)
}

console.log(\`Unknown command: \${command}\`)
process.exit(1)
`,
      },
      { path: ".gitignore", content: gitignoreFor("typescript") },
    ],
  }
}

function templateFor(name: string, framework: Framework): ProjectStructure {
  switch (framework) {
    case "react":
      return reactTemplate(name)
    case "nextjs":
      return nextjsTemplate(name)
    case "express":
      return expressTemplate(name)
    case "fastapi":
      return fastapiTemplate(name)
    case "django":
      return djangoTemplate(name)
    case "flutter":
      return flutterTemplate(name)
    case "electron":
      return electronTemplate(name)
    case "cli":
      return cliTemplate(name)
    case "none":
      return cliTemplate(name)
  }
}

export const scaffoldProject = Effect.fn("Scaffold.scaffoldProject")(function* (
  description: string,
  language: Language,
  framework: Framework,
  outputPath: string,
) {
  const name = path.basename(outputPath)
  const structure = templateFor(name, framework)

  yield* Effect.tryPromise({
    try: () => fs.mkdir(outputPath, { recursive: true }),
    catch: (e) => new ScaffoldError({ reason: `Failed to create directory: ${e}` }),
  })

  for (const dir of structure.directories) {
    yield* Effect.tryPromise({
      try: () => fs.mkdir(path.join(outputPath, dir), { recursive: true }),
      catch: (e) => new ScaffoldError({ reason: `Failed to create directory ${dir}: ${e}` }),
    })
  }

  for (const file of structure.files) {
    const filePath = path.join(outputPath, file.path)
    const fileDir = path.dirname(filePath)
    yield* Effect.tryPromise({
      try: () => fs.mkdir(fileDir, { recursive: true }),
      catch: () => new ScaffoldError({ reason: `Failed to create parent dir for ${file.path}` }),
    })
    yield* Effect.tryPromise({
      try: () => fs.writeFile(filePath, file.content, "utf-8"),
      catch: (e) => new ScaffoldError({ reason: `Failed to write ${file.path}: ${e}` }),
    })
  }

  return {
    name: structure.name,
    language: structure.language,
    framework: structure.framework,
    filesCreated: structure.files.length,
    directoriesCreated: structure.directories.length,
    outputPath,
  }
})

const DETECT_MARKERS: Array<{ file: string; type: ProjectType }> = [
  { file: "next.config.ts", type: { language: "typescript", framework: "nextjs" } },
  { file: "next.config.js", type: { language: "typescript", framework: "nextjs" } },
  { file: "next.config.mjs", type: { language: "typescript", framework: "nextjs" } },
  { file: "vite.config.ts", type: { language: "typescript", framework: "react" } },
  { file: "pubspec.yaml", type: { language: "dart", framework: "flutter" } },
  { file: "Cargo.toml", type: { language: "rust", framework: "none" } },
  { file: "go.mod", type: { language: "go", framework: "none" } },
  { file: "pom.xml", type: { language: "java", framework: "none" } },
  { file: "build.gradle", type: { language: "java", framework: "none" } },
  { file: "manage.py", type: { language: "python", framework: "django" } },
  { file: "requirements.txt", type: { language: "python", framework: "none" } },
  { file: "pyproject.toml", type: { language: "python", framework: "none" } },
  { file: "tsconfig.json", type: { language: "typescript", framework: "none" } },
  { file: "package.json", type: { language: "javascript", framework: "none" } },
]

export const detectProjectType = Effect.fn("Scaffold.detectProjectType")(function* (
  projectPath: string,
) {
  for (const marker of DETECT_MARKERS) {
    const exists = yield* Effect.tryPromise({
      try: () => fs.access(path.join(projectPath, marker.file)).then(() => true),
      catch: () => false,
    })
    if (exists) {
      if (marker.file === "requirements.txt" || marker.file === "pyproject.toml") {
        const content = yield* Effect.tryPromise({
          try: () => fs.readFile(path.join(projectPath, marker.file), "utf-8"),
          catch: () => "",
        })
        if (content.includes("fastapi")) {
          return { language: "python" as Language, framework: "fastapi" as Framework }
        }
        if (content.includes("django")) {
          return { language: "python" as Language, framework: "django" as Framework }
        }
      }
      if (marker.file === "package.json") {
        const content = yield* Effect.tryPromise({
          try: () => fs.readFile(path.join(projectPath, marker.file), "utf-8"),
          catch: () => "{}",
        })
        try {
          const pkg = JSON.parse(content)
          const deps = { ...pkg.dependencies, ...pkg.devDependencies }
          if (deps["next"]) return { language: "typescript" as Language, framework: "nextjs" as Framework }
          if (deps["electron"]) return { language: "typescript" as Language, framework: "electron" as Framework }
          if (deps["express"]) return { language: "typescript" as Language, framework: "express" as Framework }
          if (deps["react"]) return { language: "typescript" as Language, framework: "react" as Framework }
        } catch {
          // malformed package.json
        }
      }
      return marker.type
    }
  }
  return { language: "javascript" as Language, framework: "none" as Framework }
})

export function suggestStructure(description: string): string {
  return [
    `Analyze this project description and suggest the best project structure:`,
    ``,
    `Description: ${description}`,
    ``,
    `Provide:`,
    `1. Recommended language and framework`,
    `2. Folder structure as a tree`,
    `3. Key files needed with brief purpose`,
    `4. Package dependencies`,
    `5. Development and build commands`,
    ``,
    `Consider: scalability, developer experience, deployment target, and community support.`,
  ].join("\n")
}

type BoilerplateType = "auth" | "crud" | "api-routes" | "database-models"

type BoilerplateOptions = {
  language: Language
  framework: Framework
  modelName?: string
  fields?: Array<{ name: string; type: string }>
}

export const generateBoilerplate = Effect.fn("Scaffold.generateBoilerplate")(function* (
  type: BoilerplateType,
  options: BoilerplateOptions,
) {
  const files: FileEntry[] = []
  const modelName = options.modelName || "Item"
  const modelLower = modelName.toLowerCase()

  switch (type) {
    case "auth": {
      if (options.language === "typescript") {
        files.push({
          path: `src/auth/middleware.ts`,
          content: `import type { Request, Response, NextFunction } from "express"

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "")
  if (!token) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }
  next()
}
`,
        })
        files.push({
          path: `src/auth/types.ts`,
          content: `export type AuthUser = {
  id: string
  email: string
  role: "admin" | "user"
}

export type AuthToken = {
  accessToken: string
  refreshToken: string
  expiresIn: number
}
`,
        })
      } else if (options.language === "python") {
        files.push({
          path: `app/auth/dependencies.py`,
          content: `from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token = credentials.credentials
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return {"token": token}
`,
        })
      }
      break
    }

    case "crud": {
      if (options.language === "typescript") {
        files.push({
          path: `src/routes/${modelLower}.ts`,
          content: `import { Router } from "express"

const router = Router()

const items: Map<string, { id: string; [key: string]: unknown }> = new Map()

router.get("/", (_req, res) => {
  res.json([...items.values()])
})

router.get("/:id", (req, res) => {
  const item = items.get(req.params.id)
  if (!item) return res.status(404).json({ error: "Not found" })
  res.json(item)
})

router.post("/", (req, res) => {
  const id = crypto.randomUUID()
  const item = { id, ...req.body }
  items.set(id, item)
  res.status(201).json(item)
})

router.put("/:id", (req, res) => {
  if (!items.has(req.params.id)) return res.status(404).json({ error: "Not found" })
  const item = { id: req.params.id, ...req.body }
  items.set(req.params.id, item)
  res.json(item)
})

router.delete("/:id", (req, res) => {
  if (!items.delete(req.params.id)) return res.status(404).json({ error: "Not found" })
  res.status(204).send()
})

export { router as ${modelLower}Router }
`,
        })
      } else if (options.language === "python") {
        files.push({
          path: `app/routers/${modelLower}.py`,
          content: `from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from uuid import uuid4

router = APIRouter(prefix="/${modelLower}s", tags=["${modelLower}s"])

db: dict[str, dict] = {}


class ${modelName}Create(BaseModel):
    name: str


class ${modelName}Response(${modelName}Create):
    id: str


@router.get("/", response_model=list[${modelName}Response])
async def list_${modelLower}s():
    return list(db.values())


@router.get("/{item_id}", response_model=${modelName}Response)
async def get_${modelLower}(item_id: str):
    if item_id not in db:
        raise HTTPException(status_code=404, detail="Not found")
    return db[item_id]


@router.post("/", response_model=${modelName}Response, status_code=201)
async def create_${modelLower}(item: ${modelName}Create):
    item_id = str(uuid4())
    record = {"id": item_id, **item.model_dump()}
    db[item_id] = record
    return record


@router.delete("/{item_id}", status_code=204)
async def delete_${modelLower}(item_id: str):
    if item_id not in db:
        raise HTTPException(status_code=404, detail="Not found")
    del db[item_id]
`,
        })
      }
      break
    }

    case "api-routes": {
      if (options.language === "typescript" && options.framework === "nextjs") {
        files.push({
          path: `app/api/${modelLower}/route.ts`,
          content: `import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ data: [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  return NextResponse.json({ data: body }, { status: 201 })
}
`,
        })
        files.push({
          path: `app/api/${modelLower}/[id]/route.ts`,
          content: `import { NextRequest, NextResponse } from "next/server"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json({ id })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  return NextResponse.json({ id, ...body })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json({ deleted: id })
}
`,
        })
      }
      break
    }

    case "database-models": {
      if (options.language === "typescript") {
        const fields = options.fields || [
          { name: "name", type: "string" },
          { name: "createdAt", type: "Date" },
          { name: "updatedAt", type: "Date" },
        ]
        const fieldDefs = fields.map((f) => `  ${f.name}: ${f.type}`).join("\n")
        files.push({
          path: `src/models/${modelLower}.ts`,
          content: `export type ${modelName} = {
  id: string
${fieldDefs}
}

export type Create${modelName} = Omit<${modelName}, "id" | "createdAt" | "updatedAt">
export type Update${modelName} = Partial<Create${modelName}>
`,
        })
      } else if (options.language === "python") {
        files.push({
          path: `app/models/${modelLower}.py`,
          content: `from pydantic import BaseModel
from datetime import datetime


class ${modelName}Base(BaseModel):
    name: str


class ${modelName}Create(${modelName}Base):
    pass


class ${modelName}Update(BaseModel):
    name: str | None = None


class ${modelName}(${modelName}Base):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
`,
        })
      }
      break
    }
  }

  return { type, files, count: files.length }
})
