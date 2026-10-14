import type { JSX as ReactJSX } from "react";
import type { Derived } from "./index.ts";

// With `jsxImportSource` set to `react-preprocessor` in tsconfig, the JSX types are taken from here.
// At runtime React's own implementation is used as is.
export { Fragment, jsx, jsxs } from "react/jsx-runtime";

/**
 * Lets a reactive value be passed directly as an attribute.
 * `<input value={text} />` type-checks even when `text` is a `Derived<string>`; the preprocessor replaces it with the plain value.
 */
type Lift<P> = {
  [K in keyof P]: K extends "children" | "key" | "ref" ? P[K] : P[K] | Derived<P[K]>;
};

export declare namespace JSX {
  type ElementType = ReactJSX.ElementType;
  interface Element extends ReactJSX.Element {}
  interface ElementClass extends ReactJSX.ElementClass {}
  interface ElementAttributesProperty extends ReactJSX.ElementAttributesProperty {}
  interface ElementChildrenAttribute extends ReactJSX.ElementChildrenAttribute {}
  type LibraryManagedAttributes<C, P> = Lift<ReactJSX.LibraryManagedAttributes<C, P>>;
  interface IntrinsicAttributes extends ReactJSX.IntrinsicAttributes {}
  interface IntrinsicClassAttributes<T> extends ReactJSX.IntrinsicClassAttributes<T> {}
  type IntrinsicElements = {
    [K in keyof ReactJSX.IntrinsicElements]: Lift<ReactJSX.IntrinsicElements[K]>;
  };
}
