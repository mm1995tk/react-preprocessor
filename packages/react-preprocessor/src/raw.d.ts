// `import text from "./file.ts?raw"` gives the content of the file as a string.
// Vite (the tests) does this itself; the build does it with the plugin in tsdown.config.ts
declare module "*?raw" {
  const content: string;
  export default content;
}
