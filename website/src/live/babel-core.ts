// Stands in for `@babel/core` in the browser. The Babel plugin only takes `types` from it
import type { types as Types } from "@babel/core";
import * as Babel from "@babel/standalone";

// The type declarations of @babel/standalone export `types` as a type only, but the value is there
export const types = (Babel.packages as unknown as { types: typeof Types }).types;
