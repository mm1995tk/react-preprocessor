// Stands in for `node:fs` and `node:module` in the browser.
// Only the type-aware lookup uses them, and the page turns it off (`types: false`)
const unavailable = (): never => {
  throw new Error("Not available in the browser.");
};

export const readFileSync = unavailable;
export const createRequire = unavailable;
