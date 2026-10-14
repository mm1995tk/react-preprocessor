export const install = "pnpm add -D react-preprocessor";

export const setups = [
  {
    label: "Vite",
    file: "vite.config.ts",
    code: `import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import reactPreprocessor from "react-preprocessor/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Order matters: lower the sugar first, then hand plain React to the React Compiler.
  plugins: [reactPreprocessor(), react(), babel({ presets: [reactCompilerPreset()] })],
});`,
  },
  {
    label: "Next.js",
    file: "next.config.ts",
    code: `const nextConfig: NextConfig = {
  turbopack: {
    // Lower the sugar before Next.js's own transforms (SWC, React Compiler).
    rules: {
      "*.tsx": { loaders: ["react-preprocessor/loader"] },
      "*.ts": { loaders: ["react-preprocessor/loader"] },
    },
    resolveAlias: {
      "react-preprocessor/jsx-runtime": "react/jsx-runtime",
      "react-preprocessor/jsx-dev-runtime": "react/jsx-dev-runtime",
    },
  },
};`,
  },
  {
    label: "Babel",
    file: "babel.config.js",
    code: `// List react-preprocessor before the React Compiler.
export default {
  plugins: ["react-preprocessor/babel", "babel-plugin-react-compiler"],
};`,
  },
];

export const cli = `pnpm exec react-preprocessor print src/Todos.tsx    # the plain React the file becomes
pnpm exec react-preprocessor eject src --write    # rewrite a project to plain React`;

export const tsconfig = `{
  "compilerOptions": {
    "jsx": "react-jsx",
    // Lets a reactive value be used as an attribute: <input value={text} />
    "jsxImportSource": "react-preprocessor",
  },
}`;
