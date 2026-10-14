import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import reactPreprocessor from "react-preprocessor/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Order matters: lower the sugar to plain React first, then hand it to the React Compiler
  plugins: [reactPreprocessor(), react(), babel({ presets: [reactCompilerPreset()] })],
});
