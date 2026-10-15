import { types as t } from "@babel/core";
import type { NodePath, PluginAPI, PluginObject } from "@babel/core";
import { apply, forEachNode, isCheap } from "./inline.ts";
import { createTypeService } from "./types.ts";
import type { Answer, Kind, Query, TypeService } from "./types.ts";

export type Options = {
  /** Name of the module the sugar is imported from. Defaults to `react-preprocessor`. */
  importSource?: string;
  /**
   * Finds the props that receive reactive values by asking the type checker. Defaults to `true`.
   *
   * `true` needs TypeScript 7 or later. Props are found even when their type lives in another file.
   * `false` reads types as syntax. Only inline types and type aliases / interfaces
   * of the same file can be followed.
   */
  types?: boolean | TypeService;
};

// The type checker is slow to start. It is reused across files
let sharedTypes: TypeService | undefined;

/** What is remembered about an expression for a reactive value after it is replaced by the plain value */
type Info = {
  /** For a writable value, how to build the expression that replaces `update(f)` */
  update?: Update;
  /** For a value created with `reactive.new`, the name of its setter */
  setter?: string;
  /** The `useState(...)` that replaced `reactive.new` */
  state?: boolean;
  /** The `update` of `reactive.from(value, update)` */
  from?: t.Expression;
  /** The `T` of `reactive.from<T>(value, update)`, when written */
  fromType?: t.TSType | undefined;
};

type PropKind = "Reactive" | "Derived";

/** Maps a prop name to the type it is declared with */
type PropKinds = Map<string, PropKind>;

/** Takes an updater `f` (old value → new value) and returns an expression that performs the update */
type Update = (f: t.Expression) => t.Expression;

type Context = {
  importSource: string;
  /** Whether the sugar is imported */
  found: boolean;
  /** The type checker and the file information needed for queries. `null` when types are not used */
  types: { service: TypeService; filename: string; code: string } | null;
  /** Whether the file is TypeScript. Only there may the output be given a type annotation */
  typescript: boolean;
  /** Variables whose type is known to be a reactive value. Keyed by the declaring identifier or the destructuring property */
  receivable: WeakMap<t.Node, PropKind>;
  /** Whether an expression not created by the sugar is a reactive value. Keyed by the expression node */
  returns: WeakMap<t.Node, boolean>;
  root: NodePath<t.Program>;
  /** Local identifier nodes of the imported `reactive` / `$` */
  locals: { reactive?: t.Identifier; $?: t.Identifier };
  /** Maps the local name of an imported type `Reactive` / `Derived` to its original name */
  typeLocals: Map<string, PropKind>;
  /** Parameters (`props`) that receive reactive values as props. Keyed by the declaring identifier node */
  props: WeakMap<t.Identifier, PropKinds>;
  /** Variables bound to reactive values. Keyed by the declaring identifier node */
  bindings: WeakMap<t.Identifier, Info>;
  /** Expressions already replaced by plain values and not consumed yet */
  values: WeakMap<t.Node, Info>;
  /** Identifiers inside replaced expressions. They are not treated as reactive values again */
  lowered: WeakSet<t.Node>;
  /** The plain values that replaced `$(r)`. Inside `reactive.effect` they become dependencies */
  reads: WeakSet<t.Node>;
  /** The expressions that `when` / `match` were lowered to. Used to say more when one is at a wrong position */
  narrowResults: WeakSet<t.Node>;
  usedNames: Set<string>;
  /** The `react` exports the output uses. Keyed by name */
  reactImports: Map<string, { name: string; needsImport: boolean }>;
  /** Variable names used in generated code. Chosen once per file */
  names: { prev?: string; item?: string; f?: string; next?: string };
  /** Maps a component name to the names of the props it receives as reactive values */
  components: Map<string, Set<string>>;
  /** Maps a setter name to the action that removes its declaration. Called at the end if the setter was never used */
  states: Map<string, () => void>;
  usedSetters: Set<string>;
  /**
   * The setters that hold the updater of `reactive.from`, with the variable and the position of the declaration.
   * Unlike the others they are not stable across renders. `updater` is the expression held, once it is in place
   */
  heldUpdaters: Map<string, { name: string; start: number; updater?: NodePath<t.Expression> }>;
};

const METHODS = new Set(["derive", "update", "set", "focus", "each", "when", "match"]);

const isTypeScript = (filename: string | undefined): boolean => /\.[cm]?tsx?$/.test(filename ?? "");

/**
 * A build error, as the ESLint rule reports it: the message without the code frame, and the code it points at.
 * `cause` is set when the type checker could not be asked, i.e. the error is not about the code
 */
export type Diagnostic = {
  message: string;
  loc: t.SourceLocation | null | undefined;
  cause?: unknown;
};

const fail = (path: NodePath, message: string, cause?: unknown): never => {
  const error: Error & { diagnostic?: Diagnostic } = path.buildCodeFrameError(
    `react-preprocessor: ${message}`,
  );
  error.diagnostic = { message, loc: path.node.loc, ...(cause === undefined ? {} : { cause }) };
  throw error;
};

export default function reactPreprocessor(_api: PluginAPI, options: Options = {}): PluginObject {
  const importSource = options.importSource ?? "react-preprocessor";
  const types = (filename: string | undefined): TypeService | null => {
    // Only TypeScript files have types
    if (options.types === false || !isTypeScript(filename)) return null;
    if (typeof options.types === "object") return options.types;
    return (sharedTypes ??= createTypeService());
  };

  return {
    name: "react-preprocessor",

    manipulateOptions(opts, parserOpts) {
      // The sugar is valid TS syntax, so adding the TS and JSX parser plugins is enough
      const filename = opts.filename ?? "";
      const has = (name: string): boolean =>
        parserOpts.plugins.some((p) => (Array.isArray(p) ? p[0] : p) === name);
      if (isTypeScript(filename) && !has("typescript")) parserOpts.plugins.push("typescript");
      if (/\.[jt]sx$/.test(filename) && !has("jsx")) parserOpts.plugins.push("jsx");
    },

    visitor: {
      Program(program, state) {
        const ctx = createContext(program, importSource);
        ctx.typescript = isTypeScript(state.filename);
        const service = types(state.filename);
        if (service) {
          if (!state.filename) fail(program, "The type-aware transform needs a file name.");
          ctx.types = { service, filename: state.filename!, code: state.file.code };
        }
        const bind = received(program, ctx);
        // Even without importing the sugar, a file that receives reactive values needs the replacement.
        // One that binds them in a form that is not unpacked is reported, the sugar imported or not
        if (!ctx.found && !bind) {
          checkReceived(program, ctx);
          return;
        }
        // Tells the caller (the CLI) that this file goes through the replacement
        (state.file.metadata as { reactPreprocessor?: unknown }).reactPreprocessor = {
          lowered: true,
        };
        program.traverse({
          Identifier: (path) => void ctx.usedNames.add(path.node.name),
          JSXIdentifier: (path) => void ctx.usedNames.add(path.node.name),
        });
        bind?.();
        classifyBindings(program, ctx);
        checkReceived(program, ctx);
        program.traverse(lowering(ctx));
        for (const [setter, drop] of ctx.states) {
          if (!ctx.usedSetters.has(setter)) drop();
        }
        finishImports(program, ctx);
        // The replacement changed variable declarations and references. Collect them again so that
        // the plugins that follow (React Compiler) see correct scope information
        program.scope.crawl();
      },
    },
  };
}

const createContext = (program: NodePath<t.Program>, importSource: string): Context => {
  const ctx: Context = {
    importSource,
    found: false,
    types: null,
    typescript: false,
    receivable: new WeakMap(),
    returns: new WeakMap(),
    root: program,
    locals: {},
    typeLocals: new Map(),
    props: new WeakMap(),
    bindings: new WeakMap(),
    values: new WeakMap(),
    lowered: new WeakSet(),
    reads: new WeakSet(),
    narrowResults: new WeakSet(),
    usedNames: new Set(),
    reactImports: new Map(),
    names: {},
    components: new Map(),
    states: new Map(),
    usedSetters: new Set(),
    heldUpdaters: new Map(),
  };

  for (const statement of program.get("body")) {
    if (!statement.isImportDeclaration() || statement.node.source.value !== importSource) continue;
    ctx.found = true;
    for (const specifier of statement.get("specifiers")) {
      if (!specifier.isImportSpecifier()) {
        fail(specifier, `Only named imports are supported for "${importSource}".`);
        continue;
      }
      const { imported, local } = specifier.node;
      const name = t.isIdentifier(imported) ? imported.name : imported.value;
      if (name === "reactive" || name === "$") ctx.locals[name] = local;
      else if (name === "Reactive" || name === "Derived") ctx.typeLocals.set(local.name, name);
    }
  }
  return ctx;
};

/** The expression under the type-only wrappers `x as T`, `x!`, `x satisfies T`, `<T>x`, and `(x)` */
const unwrapped = (node: t.Node | null | undefined): t.Node | null | undefined => {
  while (
    t.isTSAsExpression(node) ||
    t.isTSNonNullExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isTSTypeAssertion(node) ||
    t.isParenthesizedExpression(node)
  ) {
    node = node.expression;
  }
  return node;
};

/** A destructuring whose variables may receive reactive values */
type Pattern = t.ObjectPattern | t.ArrayPattern;

/**
 * Finds the reactive values received from outside a function boundary.
 *
 * - props of a component
 * - parameters of a custom hook
 * - `const x = useX()` / `const { a, b } = useX()` / `const [a, b] = useX()`, which bind things such as
 *   a function's return value
 *
 * When found, returns the action that binds them. It creates new variable names, so call it
 * after the names used in the file have all been collected.
 */
const received = (program: NodePath<t.Program>, ctx: Context): (() => void) | null => {
  type Local = {
    path: NodePath;
    local: t.Identifier;
    name: string;
    annotation: t.Node | null | undefined;
    accept: (kind: PropKind) => void;
  };
  type Props = { path: NodePath; param: t.Identifier | t.ObjectPattern };
  const locals: Local[] = [];
  const components: Props[] = [];
  const patterns: { path: NodePath; pattern: Pattern }[] = [];

  /** Checks the variables of a destructuring one by one. With `bind`, the destructuring is rewritten later */
  const addPattern = (path: NodePath, pattern: Pattern, bind: boolean): void => {
    const items = t.isObjectPattern(pattern) ? pattern.properties : pattern.elements;
    for (const item of items) {
      // A property of an object, or an item of an array. What is received is keyed by this node
      const value = t.isObjectProperty(item) ? item.value : item;
      const local = t.isAssignmentPattern(value) ? value.left : value;
      if (!item || !t.isIdentifier(local) || t.isRestElement(item)) continue;
      const name = (t.isObjectProperty(item) && propertyKey(item.key, item.computed)) || local.name;
      const accept = (kind: PropKind): void => void ctx.receivable.set(item, kind);
      locals.push({ path, local, name, annotation: null, accept });
    }
    if (bind) patterns.push({ path, pattern });
  };

  program.traverse({
    Function(path) {
      // Components and custom hooks are written at the top level of a module
      if (!isTopLevelFunction(path)) return;
      const name = functionName(path);
      const { params } = path.node;
      if (isHookName(name)) {
        for (const [index, param] of params.entries()) {
          if (t.isObjectPattern(param) || t.isArrayPattern(param)) addPattern(path, param, true);
          if (!t.isIdentifier(param)) continue;
          const accept = (kind: PropKind): void => void (params[index] = receive(ctx, param, kind));
          locals.push({
            path,
            local: param,
            name: param.name,
            annotation: param.typeAnnotation,
            accept,
          });
        }
      } else if (isComponentName(name)) {
        const [param] = params;
        if (t.isIdentifier(param) || t.isObjectPattern(param)) components.push({ path, param });
      }
    },
    VariableDeclarator(path) {
      const { id } = path.node;
      if (!path.parentPath.isVariableDeclaration({ kind: "const" })) return;
      // Received as a function's return value or as a property of an object, possibly under `as` or `!`
      const init = unwrapped(path.node.init);
      if (!t.isCallExpression(init) && !t.isMemberExpression(init) && !t.isAwaitExpression(init)) {
        return;
      }
      if (t.isObjectPattern(id) || t.isArrayPattern(id)) addPattern(path, id, false);
      if (!t.isIdentifier(id)) return;
      const accept = (kind: PropKind): void => void ctx.receivable.set(id, kind);
      locals.push({ path, local: id, name: id.name, annotation: id.typeAnnotation, accept });
    },
  });
  if (locals.length === 0 && components.length === 0) return null;

  const binds: (() => void)[] = [];
  const bindKinds = ({ path, param }: Props, kinds: PropKinds): void => {
    if (kinds.size === 0) return;
    const name = functionName(path as NodePath<t.Function>);
    if (name) ctx.components.set(name, new Set(kinds.keys()));
    if (t.isIdentifier(param)) binds.push(() => void ctx.props.set(param, kinds));
    else binds.push(() => bindProps(ctx, path, param, (_, key) => kinds.get(key)));
  };

  if (!ctx.types) {
    // Without types, only the type annotations written in place are read
    for (const component of components) {
      const annotation = component.param.typeAnnotation;
      if (!t.isTSTypeAnnotation(annotation)) continue;
      bindKinds(component, reactiveProps(ctx, component.path, annotation.typeAnnotation));
    }
    for (const { annotation, accept } of locals) {
      const kind = t.isTSTypeAnnotation(annotation) && kindOfType(ctx, annotation.typeAnnotation);
      if (kind) binds.push(() => accept(kind));
    }
  } else {
    // The queries of one file are sent together
    for (const { path, param } of components) {
      if (t.isObjectPattern(param)) addPattern(path, param, true);
    }
    const objects = components.filter(({ param }) => t.isIdentifier(param));
    const answers = ask(ctx, program, [
      ...locals.map(({ local }): Query => ({ position: local.start ?? 0, of: "value" })),
      ...objects.map(({ param }): Query => ({ position: param.start ?? 0, of: "props" })),
    ]);
    const strict = (path: NodePath, name: string, kind: Kind | null): PropKind | null =>
      kind === "optional" ? fail(path, `The reactive value \`${name}\` cannot be optional.`) : kind;

    for (const [index, { path, name, accept }] of locals.entries()) {
      const kind = strict(path, name, answers[index]!.kind);
      if (kind) binds.push(() => accept(kind));
    }
    for (const [index, component] of objects.entries()) {
      const kinds: PropKinds = new Map();
      for (const [name, kind] of answers[locals.length + index]!.props) {
        kinds.set(name, strict(component.path, name, kind)!);
      }
      bindKinds(component, kinds);
    }
  }
  if (binds.length === 0) return null;

  for (const { path, pattern } of patterns) {
    binds.push(() => bindProps(ctx, path, pattern, (item) => ctx.receivable.get(item)));
  }
  return () => binds.forEach((bind) => bind());
};

/** Reports a reactive value that would stay `{ value, update }`. Nothing to report for a plain value */
const reportBoxed = (path: NodePath, name: string, kind: Kind | null): void => {
  if (!kind) return;
  if (kind === "optional") fail(path, `The reactive value \`${name}\` cannot be optional.`);
  fail(
    path,
    `The reactive value \`${name}\` must be bound with \`const\` to a plain name, directly to what gives it: ` +
      `\`const ${name} = ...\`, \`const { ${name} } = ...\`, or \`const [${name}] = ...\`.`,
  );
};

/**
 * Reports a reactive value bound in a form that is not unpacked. It would stay `{ value, update }`
 * at runtime, although its type says `Reactive<T>`: `let x = useX()`, `const x = cond ? useA() : useB()`,
 * a nested destructuring. Run after the bindings are classified: what is classified is unpacked.
 */
const checkReceived = (program: NodePath<t.Program>, ctx: Context): void => {
  const suspects: { path: NodePath; local: t.Identifier }[] = [];
  program.traverse({
    VariableDeclarator(path) {
      // `declare const x: Reactive<T>` declares no value
      if (path.parentPath.isVariableDeclaration({ declare: true })) return;
      for (const local of Object.values(t.getBindingIdentifiers(path.node.id))) {
        // A generated name has no position, and nothing to ask about
        if (ctx.bindings.has(local) || local.start == null) continue;
        suspects.push({ path, local });
      }
    },
  });
  if (!ctx.types) {
    for (const { path, local } of suspects) {
      const annotation = local.typeAnnotation;
      if (t.isTSTypeAnnotation(annotation)) {
        reportBoxed(path, local.name, kindOfType(ctx, annotation.typeAnnotation));
      }
    }
    return;
  }
  const answers = ask(
    ctx,
    program,
    suspects.map(({ local }): Query => ({ position: local.start!, of: "value" })),
  );
  for (const [index, { path, local }] of suspects.entries()) {
    reportBoxed(path, local.name, answers[index]!.kind);
  }
};

/**
 * Whether an expression not created by the sugar is a reactive value. Asks the type checker.
 *
 * Looks at a function's return value (`useX()`) and a property of an object (`useX().count`).
 * A reactive value there has the `{ value, update }` shape of a value that crossed a function boundary.
 */
const returnsReactive = (ctx: Context, node: t.Node): boolean => {
  if (!ctx.types) return false;
  const known = ctx.returns.get(node);
  if (known !== undefined) return known;

  let query: Query | null = null;
  if (t.isCallExpression(node)) {
    const { callee } = node;
    const name = t.isMemberExpression(callee) && !callee.computed ? callee.property : callee;
    if (t.isIdentifier(name) && name.start != null) query = { position: name.start, of: "returns" };
  } else if (t.isMemberExpression(node) && !node.computed && t.isIdentifier(node.property)) {
    if (node.property.start != null) query = { position: node.property.start, of: "value" };
  }

  const [answer] = query ? ask(ctx, ctx.root, [query]) : [];
  const result = answer?.kind === "Reactive" || answer?.kind === "Derived";
  ctx.returns.set(node, result);
  return result;
};

/** Asks the type checker. When it cannot be asked, the reason is reported as an error */
const ask = (ctx: Context, path: NodePath, queries: Query[]): Answer[] => {
  if (queries.length === 0 || !ctx.types) return [];
  const { service, filename, code } = ctx.types;
  try {
    return service.query(filename, code, queries);
  } catch (error) {
    return fail(path, error instanceof Error ? error.message : String(error), error);
  }
};

const freshName = (ctx: Context, base: string): string => {
  let name = base;
  for (let n = 2; ctx.usedNames.has(name); n++) name = `${base}${n}`;
  ctx.usedNames.add(name);
  return name;
};

const roleName = (ctx: Context, role: "prev" | "item" | "f" | "next"): string =>
  (ctx.names[role] ??= freshName(ctx, role));

const call = (ctx: Context, f: t.Expression, args: t.Expression[]): t.Expression =>
  apply(f, args, (clone) => markLowered(ctx, clone));

const markLowered = (ctx: Context, node: t.Node): void =>
  forEachNode(node, (inner) => void ctx.lowered.add(inner));

/** Creates an identifier for an already-replaced value. It must not be treated as a reference to a reactive value */
const plain = (ctx: Context, name: string): t.Identifier => {
  const id = t.identifier(name);
  ctx.lowered.add(id);
  return id;
};

const memberOf = (object: t.Expression, key: string): t.MemberExpression =>
  t.isValidIdentifier(key)
    ? t.memberExpression(object, t.identifier(key))
    : t.memberExpression(object, t.stringLiteral(key), true);

const stateUpdate =
  (ctx: Context, setter: string): Update =>
  (f) => {
    ctx.usedSetters.add(setter);
    return t.callExpression(t.identifier(setter), [f]);
  };

const setterName = (name: string): string => `set${name[0]!.toUpperCase()}${name.slice(1)}`;

/**
 * Builds `{ value, update }`, the runtime representation of a reactive value that crosses a function boundary.
 * `update` takes an updater (old value → new value). A read-only value does not get one.
 */
const box = (ctx: Context, value: t.Expression, info: Info): t.ObjectExpression => {
  const fields = [t.objectProperty(t.identifier("value"), value)];
  if (info.update) fields.push(t.objectProperty(t.identifier("update"), updater(ctx, info)));
  return t.objectExpression(fields);
};

/** A function that takes an updater (old value → new value) and updates. What `r.update` is when used as a value */
const updater = (ctx: Context, info: Info): t.Expression => {
  if (info.setter) {
    ctx.usedSetters.add(info.setter);
    return t.identifier(info.setter);
  }
  const f = roleName(ctx, "f");
  return t.arrowFunctionExpression([t.identifier(f)], info.update!(t.identifier(f)));
};

/** A function that takes a new value and replaces. What `r.set` is when used as a value */
const replacer = (ctx: Context, info: Info): t.Expression => {
  const next = roleName(ctx, "next");
  const constant = t.arrowFunctionExpression([], t.identifier(next));
  return t.arrowFunctionExpression([t.identifier(next)], info.update!(constant));
};

/** Whether evaluating the expression later gives the same result as evaluating it now */
const isConstant = (path: NodePath, node: t.Node): boolean => {
  if (t.isLiteral(node)) return !t.isTemplateLiteral(node) || node.expressions.length === 0;
  if (t.isFunction(node)) return true;
  if (t.isIdentifier(node)) {
    return node.name === "undefined" || path.scope.getBinding(node.name)?.kind === "const";
  }
  if (t.isUnaryExpression(node))
    return node.operator !== "delete" && isConstant(path, node.argument);
  if (t.isArrayExpression(node)) {
    return node.elements.every((element) => element !== null && isConstant(path, element));
  }
  if (t.isObjectExpression(node)) {
    return node.properties.every(
      (property) =>
        t.isObjectProperty(property) && !property.computed && isConstant(path, property.value),
    );
  }
  return false;
};

/**
 * Whether the expression is a constant the syntax can see: a literal (`0`, `-1`, `"a"`, `0 as const`),
 * or a `const` of this file that leads to one (`const start = 0`, `const again = start`).
 */
const isLiteralValue = (
  scope: NodePath["scope"],
  node: t.Node,
  seen = new Set<t.Node>(),
): boolean => {
  if (t.isTemplateLiteral(node)) return node.expressions.length === 0;
  if (t.isLiteral(node)) return !t.isRegExpLiteral(node);
  // `0 as const`, `0 satisfies number`: the type is written on the value, and the value is still a literal
  if (
    t.isTSAsExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isTSNonNullExpression(node) ||
    t.isTSTypeAssertion(node) ||
    t.isParenthesizedExpression(node)
  ) {
    return isLiteralValue(scope, node.expression, seen);
  }
  if (t.isUnaryExpression(node)) {
    return node.operator !== "delete" && isLiteralValue(scope, node.argument, seen);
  }
  if (!t.isIdentifier(node)) return false;
  const binding = scope.getBinding(node.name);
  if (!binding) return node.name === "undefined";
  // `const a = b, b = a` does not end
  if (binding.kind !== "const" || seen.has(binding.identifier)) return false;
  seen.add(binding.identifier);
  const declarator = binding.path;
  if (!declarator.isVariableDeclarator() || !declarator.node.init) return false;
  return isLiteralValue(declarator.scope, declarator.node.init, seen);
};

/** If `props.key` refers to a prop that receives a reactive value, returns its information */
const propInfo = (ctx: Context, node: t.Node, scope: NodePath["scope"]): Info | null => {
  if (!t.isMemberExpression(node) || !t.isIdentifier(node.object)) return null;
  const declared = scope.getBinding(node.object.name)?.identifier;
  const kinds = declared && ctx.props.get(declared);
  if (!kinds) return null;
  const key = propertyKey(node.property, node.computed);
  const kind = key === null ? undefined : kinds.get(key);
  if (!kind) return null;
  if (kind === "Derived") return {};
  return {
    update: (f) => {
      const boxed = t.cloneNode(node, true);
      markLowered(ctx, boxed);
      return t.callExpression(memberOf(boxed, "update"), [f]);
    },
  };
};

const propertyKey = (key: t.Node, computed: boolean): string | null => {
  if (t.isIdentifier(key) && !computed) return key.name;
  return t.isStringLiteral(key) ? key.value : null;
};

/**
 * Collects the props declared as reactive values from the props type.
 *
 * Babel cannot resolve types. Only inline types and the type aliases / interfaces
 * declared in the same file are followed.
 */
const reactiveProps = (
  ctx: Context,
  path: NodePath,
  type: t.TSType,
  kinds: PropKinds = new Map(),
  seen: Set<string> = new Set(),
): PropKinds => {
  const collect = (members: t.TSTypeElement[]): void => {
    for (const element of members) {
      if (!t.isTSPropertySignature(element)) continue;
      const key = propertyKey(element.key, element.computed ?? false);
      const declared = element.typeAnnotation?.typeAnnotation;
      if (key === null || !t.isTSTypeReference(declared) || !t.isIdentifier(declared.typeName)) {
        continue;
      }
      const kind = ctx.typeLocals.get(declared.typeName.name);
      if (!kind) continue;
      if (element.optional) fail(path, `The reactive prop \`${key}\` cannot be optional.`);
      kinds.set(key, kind);
    }
  };

  if (t.isTSTypeLiteral(type)) {
    collect(type.members);
  } else if (t.isTSIntersectionType(type)) {
    for (const part of type.types) reactiveProps(ctx, path, part, kinds, seen);
  } else if (t.isTSTypeReference(type) && t.isIdentifier(type.typeName)) {
    const name = type.typeName.name;
    if (seen.has(name)) return kinds;
    seen.add(name);
    const program = path.findParent((p) => p.isProgram()) as NodePath<t.Program>;
    for (const statement of program.node.body) {
      const declaration = t.isExportNamedDeclaration(statement) ? statement.declaration : statement;
      if (t.isTSTypeAliasDeclaration(declaration) && declaration.id.name === name) {
        reactiveProps(ctx, path, declaration.typeAnnotation, kinds, seen);
      } else if (t.isTSInterfaceDeclaration(declaration) && declaration.id.name === name) {
        collect(declaration.body.body);
      }
    }
  }
  return kinds;
};

/**
 * Builds the destructuring that unpacks a received reactive value `{ value, update }`, and
 * registers `local` as a variable bound to a reactive value.
 */
const receive = (ctx: Context, local: t.Identifier, kind: PropKind): t.ObjectPattern => {
  const pattern = t.objectPattern([t.objectProperty(t.identifier("value"), local)]);
  let info: Info = {};
  if (kind === "Reactive") {
    const setter = freshName(ctx, setterName(local.name));
    pattern.properties.push(t.objectProperty(t.identifier("update"), t.identifier(setter)));
    ctx.states.set(setter, () => void (pattern.properties.length = 1));
    info = { setter, update: stateUpdate(ctx, setter) };
  }
  // The annotation `Reactive<T>` describes `{ value, update }`, so it moves to the destructuring
  pattern.typeAnnotation = local.typeAnnotation ?? null;
  local.typeAnnotation = null;
  ctx.bindings.set(local, info);
  return pattern;
};

/**
 * Rewrites the destructuring `{ value }` to `{ value: { value, update: setValue } }`,
 * and `[value]` to `[{ value, update: setValue }]`
 */
const bindProps = (
  ctx: Context,
  path: NodePath,
  pattern: Pattern,
  kindOf: (item: t.ObjectProperty | t.PatternLike, key: string) => PropKind | undefined,
): void => {
  const items = t.isObjectPattern(pattern) ? pattern.properties : pattern.elements;
  for (const [index, item] of items.entries()) {
    if (!item || t.isRestElement(item)) continue;
    const value = t.isObjectProperty(item) ? item.value : item;
    const local = t.isAssignmentPattern(value) ? value.left : value;
    const key = t.isObjectProperty(item)
      ? propertyKey(item.key, item.computed)
      : t.isIdentifier(local)
        ? local.name
        : null;
    const kind = key === null ? undefined : kindOf(item, key);
    if (!kind) continue;
    if (!t.isIdentifier(value)) {
      fail(
        path,
        `The reactive value \`${key}\` must be bound to a plain name, without a default value.`,
      );
      continue;
    }
    if (t.isObjectProperty(item)) {
      item.value = receive(ctx, value, kind);
      item.shorthand = false;
    } else {
      (items as (t.PatternLike | null)[])[index] = receive(ctx, value, kind);
    }
  }
};

/** An inline type `Reactive<T>` / `Derived<T>` */
const kindOfType = (ctx: Context, type: t.TSType): PropKind | null =>
  t.isTSTypeReference(type) && t.isIdentifier(type.typeName)
    ? (ctx.typeLocals.get(type.typeName.name) ?? null)
    : null;

/**
 * The type of the updater of `reactive.from`, `(f: (old: T) => T) => void`.
 *
 * `reactive.from` gave it to the function written in place. Once the call is gone, nothing else does.
 * Without a `T` written in the source it is `typeof name`, the type of the variable the value is bound to.
 */
const updaterType = (name: string, inner: t.TSType | null): t.TSTypeAnnotation => {
  const value = (): t.TSType =>
    inner ? t.cloneNode(inner, true) : t.tsTypeQuery(t.identifier(name));
  const f = t.tsFunctionType(null, [typedParam("old", value())], t.tsTypeAnnotation(value()));
  return t.tsTypeAnnotation(
    t.tsFunctionType(null, [typedParam("f", f)], t.tsTypeAnnotation(t.tsVoidKeyword())),
  );
};

/** A parameter of a function type, `name: type` */
const typedParam = (name: string, type: t.TSType): t.Identifier => {
  const param = t.identifier(name);
  param.typeAnnotation = t.tsTypeAnnotation(type);
  return param;
};

/**
 * Whether the expression has its type without being told one: a reference, or a function written in place
 * whose parameters are all annotated
 */
const isSelfTyped = (node: t.Expression): boolean => {
  if (t.isIdentifier(node) || t.isMemberExpression(node)) return true;
  if (!t.isArrowFunctionExpression(node) && !t.isFunctionExpression(node)) return false;
  return node.params.every((param) => "typeAnnotation" in param && param.typeAnnotation != null);
};

/** Lens. Writes an update of a part back as an update of the whole, `prev => ({ ...prev, key: f(prev.key) })` */
const focusUpdate =
  (ctx: Context, parent: Update, key: string): Update =>
  (f) => {
    const prev = roleName(ctx, "prev");
    const value = call(ctx, f, [memberOf(t.identifier(prev), key)]);
    // In an object literal, a plain `__proto__` key sets the prototype. Only a computed key defines the property
    const property =
      key === "__proto__"
        ? t.objectProperty(t.stringLiteral(key), value, true)
        : t.objectProperty(
            t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key),
            value,
          );
    const next = t.objectExpression([t.spreadElement(t.identifier(prev)), property]);
    return parent(t.arrowFunctionExpression([t.identifier(prev)], next));
  };

/**
 * Writes an update of a list item back as an update of the whole list.
 *
 * The item is found by key, not by index. Even if the order has changed by the time batched updates
 * are applied, the same item is hit.
 */
const eachUpdate =
  (
    ctx: Context,
    parent: Update,
    keyOf: (item: t.Expression) => t.Expression,
    name: string,
  ): Update =>
  (f) => {
    const prev = roleName(ctx, "prev");
    const item = roleName(ctx, "item");
    const same = t.binaryExpression("===", keyOf(t.identifier(item)), keyOf(plain(ctx, name)));
    const replaced = t.conditionalExpression(
      same,
      call(ctx, f, [t.identifier(item)]),
      t.identifier(item),
    );
    const next = t.callExpression(memberOf(t.identifier(prev), "map"), [
      t.arrowFunctionExpression([t.identifier(item)], replaced),
    ]);
    return parent(t.arrowFunctionExpression([t.identifier(prev)], next));
  };

/** Turns the `key` of `r.each(key, render)` into a function that builds the expression applying it to a given item */
const keyOfEach =
  (ctx: Context, each: t.CallExpression) =>
  (item: t.Expression): t.Expression => {
    const key = t.cloneNode(each.arguments[0] as t.Expression, true);
    markLowered(ctx, key);
    return call(ctx, key, [item]);
  };

/** The item variable that the `render` of `r.each(key, render)` receives */
const eachItem = (each: t.CallExpression): t.Identifier | null => {
  const render = each.arguments[1];
  if (!t.isArrowFunctionExpression(render) && !t.isFunctionExpression(render)) return null;
  const [item] = render.params;
  return render.params.length === 1 && t.isIdentifier(item) ? item : null;
};

/**
 * Narrowing. Writes an update of the narrowed value back as an update of the whole,
 * `prev => guard(prev) ? f(prev) : prev`.
 *
 * The guard is checked again when the update is applied. If the value no longer passes it,
 * the update is dropped.
 */
const whenUpdate =
  (ctx: Context, parent: Update, guardOf: (value: t.Expression) => t.Expression): Update =>
  (f) => {
    const prev = roleName(ctx, "prev");
    const next = t.conditionalExpression(
      guardOf(t.identifier(prev)),
      call(ctx, f, [t.identifier(prev)]),
      t.identifier(prev),
    );
    return parent(t.arrowFunctionExpression([t.identifier(prev)], next));
  };

/**
 * One branch of `when` / `match`. `guardOf` builds the test that selects the branch for a given value.
 * The `rest` of `when` has none: it takes what is left
 */
type Branch = { handler: t.Expression; guardOf?: (value: t.Expression) => t.Expression };

/**
 * The variable that a branch of `when` / `match` receives. `undefined` when the function takes none,
 * `null` when it is not a function of that form
 */
const branchParam = (handler: t.Node): t.Identifier | undefined | null => {
  if (!t.isArrowFunctionExpression(handler) && !t.isFunctionExpression(handler)) return null;
  const [param] = handler.params;
  if (handler.params.length === 0) return undefined;
  return handler.params.length === 1 && t.isIdentifier(param) ? param : null;
};

const isHandler = (handler: t.Node | undefined): handler is t.Expression =>
  handler !== undefined && branchParam(handler) !== null;

/**
 * Reads the branches of `r.when(guard, { narrowed, rest? })` / `r.match(key, cases)`.
 *
 * With `report`, a call that is not written in the expected form is reported through it.
 * Without, `null` is returned for such a call.
 */
const branchesOf = (
  ctx: Context,
  node: t.CallExpression,
  method: "when" | "match",
  report?: (message: string) => never,
): Branch[] | null => {
  const bad = (message: string): null => (report ? report(message) : null);
  const args = node.arguments;

  if (method === "when") {
    const form = "`when(guard, { narrowed: (value) => ..., rest: (value) => ... })`";
    const [test, cases] = args;
    if (args.length !== 2 || !t.isExpression(test) || !t.isObjectExpression(cases)) {
      return bad(`\`when\` takes a guard and an object literal of branches: ${form}.`);
    }
    const named: Record<string, t.Expression> = {};
    for (const property of cases.properties) {
      const name =
        t.isObjectProperty(property) && !property.computed
          ? t.isIdentifier(property.key)
            ? property.key.name
            : t.isStringLiteral(property.key)
              ? property.key.value
              : null
          : null;
      if (
        !t.isObjectProperty(property) ||
        (name !== "narrowed" && name !== "rest") ||
        named[name] ||
        !isHandler(property.value)
      ) {
        return bad(
          "The branches of `when` are `narrowed` and an optional `rest`, each a function " +
            `that takes the value as one plain parameter: ${form}.`,
        );
      }
      named[name] = property.value;
    }
    const { narrowed, rest } = named;
    if (!narrowed) return bad(`\`when\` needs a \`narrowed\` branch: ${form}.`);
    // Like the key of `each`, the guard is copied into each place it is checked
    const guardOf = (value: t.Expression): t.Expression => {
      const guard = t.cloneNode(node.arguments[0] as t.Expression, true);
      markLowered(ctx, guard);
      return call(ctx, guard, [value]);
    };
    return [{ handler: narrowed, guardOf }, ...(rest ? [{ handler: rest }] : [])];
  }

  const [key, cases] = args;
  if (args.length !== 2) return bad("`match` takes exactly 2 arguments.");
  if (!t.isStringLiteral(key)) return bad("`match` takes a string literal key.");
  if (!t.isObjectExpression(cases)) {
    return bad(
      "The second argument of `match` must be an object literal: `{ ok: (value) => ... }`.",
    );
  }
  const branches: Branch[] = [];
  for (const property of cases.properties) {
    const named = t.isObjectProperty(property) && !property.computed ? property.key : null;
    if (t.isIdentifier(named) && (named.name === "true" || named.name === "false")) {
      return bad(
        `\`match\` compares the key with the name of each case, so \`${named.name}\` would be the string "${named.name}". ` +
          `For a boolean, use \`when\`. For the string, write the case as \`"${named.name}": ...\`.`,
      );
    }
    const tag = t.isIdentifier(named)
      ? t.stringLiteral(named.name)
      : t.isStringLiteral(named) || t.isNumericLiteral(named)
        ? named
        : null;
    if (!t.isObjectProperty(property) || !tag || !isHandler(property.value)) {
      return bad(
        "Each case of `match` must be a non-computed key with a function " +
          "that takes the value as one plain parameter: `ok: (value) => ...`.",
      );
    }
    const guardOf = (value: t.Expression): t.Expression =>
      t.binaryExpression("===", memberOf(value, key.value), t.cloneNode(tag));
    branches.push({ handler: property.value, guardOf });
  }
  return branches;
};

/**
 * Builds the expression that picks a branch of `when` / `match`: `guard(r) ? narrowed(r) : rest(r)`.
 * When no branch is picked, the value is `undefined`.
 */
const narrow = (ctx: Context, target: t.Expression, branches: Branch[]): t.Expression => {
  const { param, use } = narrowed(ctx, target);
  let result: t.Expression = t.identifier("undefined");
  for (const { handler, guardOf } of branches.toReversed()) {
    const body = call(ctx, handler, branchParam(handler) ? [use()] : []);
    result = guardOf ? t.conditionalExpression(guardOf(use()), body, result) : body;
  }
  return param ? t.callExpression(t.arrowFunctionExpression([param], result), [target]) : result;
};

/**
 * The value of `when` / `match` is copied into the tests and the branches. One that would repeat
 * a computation is computed once and held in `param`
 */
const narrowed = (
  ctx: Context,
  target: t.Expression,
): { param: t.Identifier | null; use: () => t.Expression } => {
  const param = isCheap(target) ? null : t.identifier(freshName(ctx, "value"));
  const use = (): t.Expression => {
    const copy = t.cloneNode(param ?? target, true);
    markLowered(ctx, copy);
    return copy;
  };
  return { param, use };
};

/**
 * `when` / `match` written as a statement, for what its branches do: `if (guard(r)) narrowed(r); else rest(r);`.
 * What the branches return is dropped.
 */
const narrowStatement = (ctx: Context, target: t.Expression, branches: Branch[]): t.Statement => {
  const { param, use } = narrowed(ctx, target);
  let result: t.Statement | null = null;
  for (const { handler, guardOf } of branches.toReversed()) {
    const body = t.blockStatement([
      t.expressionStatement(call(ctx, handler, branchParam(handler) ? [use()] : [])),
    ]);
    result = guardOf ? t.ifStatement(guardOf(use()), body, result) : body;
  }
  result ??= t.emptyStatement();
  if (!param) return result;
  const held = t.variableDeclaration("const", [t.variableDeclarator(param, target)]);
  return t.blockStatement([held, result]);
};

const isMethodCall = <M extends string>(
  node: t.Node,
  ...methods: M[]
): node is t.CallExpression & {
  callee: t.MemberExpression & { object: t.Expression; property: t.Identifier & { name: M } };
} =>
  t.isCallExpression(node) &&
  t.isMemberExpression(node.callee) &&
  !node.callee.computed &&
  t.isIdentifier(node.callee.property) &&
  (methods as string[]).includes(node.callee.property.name);

/** Whether `callee` is `reactive.<method>` on the imported `reactive` */
const isReactiveMember = (
  ctx: Context,
  scope: NodePath["scope"],
  callee: t.Node,
  method: "new" | "derive" | "of" | "from" | "handler" | "effect",
): boolean =>
  t.isMemberExpression(callee) &&
  !callee.computed &&
  t.isIdentifier(callee.property, { name: method }) &&
  t.isIdentifier(callee.object) &&
  refersTo(scope, callee.object, ctx.locals.reactive);

const refersTo = (
  scope: NodePath["scope"],
  node: t.Node,
  local: t.Identifier | undefined,
): boolean =>
  local !== undefined && t.isIdentifier(node) && scope.getBinding(node.name)?.identifier === local;

/**
 * Finds every variable bound to a reactive value before any rewriting starts.
 *
 * Rewriting changes the shape of initializers. Everything is examined while the original shape remains,
 * so that a reference appearing before its declaration (function hoisting) can still be classified.
 */
const classifyBindings = (program: NodePath<t.Program>, ctx: Context): void => {
  const visiting = new Set<t.Node>();

  const classify = (declarator: NodePath<t.VariableDeclarator>): Info | null => {
    const { id, init } = declarator.node;
    if (!t.isIdentifier(id) || !init) return null;
    const known = ctx.bindings.get(id);
    if (known) return known;
    if (visiting.has(id)) return null;
    const declaration = declarator.parentPath;
    if (!declaration.isVariableDeclaration({ kind: "const" })) return null;

    visiting.add(id);
    const info = infoOf(init, declarator.scope, id.name);
    visiting.delete(id);
    if (info) {
      ctx.bindings.set(id, info);
      return info;
    }
    // A reactive type on a value not created by the sugar means it was received from outside the boundary
    const kind = ctx.receivable.get(id);
    if (!kind) return null;
    declarator.node.id = receive(ctx, id, kind);
    return ctx.bindings.get(id)!;
  };

  const infoOf = (node: t.Node, scope: NodePath["scope"], name: string): Info | null => {
    // `useX()!`, `useX() as Reactive<T>`: the type is said again, the value is the same
    node = unwrapped(node)!;
    if (t.isMemberExpression(node)) return propInfo(ctx, node, scope);
    if (t.isIdentifier(node)) {
      const binding = scope.getBinding(node.name);
      if (!binding) return null;
      const known = ctx.bindings.get(binding.identifier);
      if (known) return known;
      return binding.path.isVariableDeclarator() ? classify(binding.path) : null;
    }
    if (!t.isCallExpression(node)) return null;
    const { callee } = node;
    if (isReactiveMember(ctx, scope, callee, "new")) {
      const setter = freshName(ctx, setterName(name));
      return { setter, update: stateUpdate(ctx, setter) };
    }
    if (isReactiveMember(ctx, scope, callee, "from")) {
      const setter = freshName(ctx, setterName(name));
      // Known before any lowering, so that an effect written above the declaration sees it too
      ctx.heldUpdaters.set(setter, { name, start: node.start ?? 0 });
      return { setter, update: stateUpdate(ctx, setter) };
    }
    if (isReactiveMember(ctx, scope, callee, "derive")) return {};
    if (isReactiveMember(ctx, scope, callee, "of")) return {};
    if (isMethodCall(node, "derive")) {
      const target = node.callee.object;
      // Methods chained directly on a received value, as in `useX().derive(f)`
      return infoOf(target, scope, name) || returnsReactive(ctx, target) ? {} : null;
    }
    if (isMethodCall(node, "focus")) {
      const parent = infoOf(node.callee.object, scope, name);
      const [key] = node.arguments;
      if (!parent?.update || !t.isStringLiteral(key)) return parent && {};
      return { update: focusUpdate(ctx, parent.update, key.value) };
    }
    if (isMethodCall(node, "when", "match")) {
      const target = node.callee.object;
      return infoOf(target, scope, name) || returnsReactive(ctx, target) ? {} : null;
    }
    return null;
  };

  program.traverse({
    VariableDeclarator(path) {
      // `const { value } = props`
      const { id, init } = path.node;
      if (t.isObjectPattern(id) && t.isIdentifier(init)) {
        const declared = path.scope.getBinding(init.name)?.identifier;
        const kinds = declared && ctx.props.get(declared);
        if (kinds) bindProps(ctx, path, id, (_, key) => kinds.get(key));
        return;
      }
      // `const { count } = useCounter()`, `const [count] = useCounter()`
      if (t.isObjectPattern(id) || t.isArrayPattern(id)) {
        bindProps(ctx, path, id, (item) => ctx.receivable.get(item));
        return;
      }
      classify(path);
    },
    // The `item` of `r.each(key, item => ...)` is a reactive value for the item
    CallExpression(path) {
      // The value a branch of `r.when(...)` / `r.match(...)` receives is a reactive value, narrowed
      if (isMethodCall(path.node, "when", "match")) {
        const method = path.node.callee.property.name;
        const target = path.node.callee.object;
        const whole =
          infoOf(target, path.scope, method) ?? (returnsReactive(ctx, target) ? {} : null);
        for (const { handler, guardOf } of (whole && branchesOf(ctx, path.node, method)) || []) {
          const param = branchParam(handler);
          if (!param) continue;
          const update = whole?.update;
          // What `rest` receives is read-only
          ctx.bindings.set(
            param,
            update && guardOf ? { update: whenUpdate(ctx, update, guardOf) } : {},
          );
        }
        return;
      }
      if (!isMethodCall(path.node, "each")) return;
      const item = eachItem(path.node);
      const target = path.node.callee.object;
      // A list returned by a hook, as in `useX().each(...)`, can only be read
      const list =
        item &&
        (infoOf(target, path.scope, item.name) ?? (returnsReactive(ctx, target) ? {} : null));
      if (!item || !list) return;
      const keyOf = keyOfEach(ctx, path.node);
      ctx.bindings.set(
        item,
        list.update ? { update: eachUpdate(ctx, list.update, keyOf, item.name) } : {},
      );
    },
  });
};

/** The nodes that hold types only. Declarations of types included */
const TYPES =
  "TSType|TSTypeAnnotation|TSTypeParameterInstantiation|TSTypeParameterDeclaration|TSTypeAliasDeclaration|TSInterfaceDeclaration";

const lowering = (ctx: Context): Parameters<NodePath["traverse"]>[0] => {
  const consume = (node: t.Node): Info | undefined => {
    const info = ctx.values.get(node);
    ctx.values.delete(node);
    if (t.isIdentifier(node)) ctx.lowered.add(node);
    return info;
  };

  /** Registers the expression as replaced and checks that it may be used at this position */
  const produce = (path: NodePath, info: Info): void => {
    // React compares dependencies by identity. `{ value, update }` would be a new object on every render
    if (isDependency(path)) {
      markLowered(ctx, path.node);
      return;
    }
    // At a position that crosses a function boundary, use the receiver's representation `{ value, update }`
    if (isBoxPosition(ctx, path)) {
      const value = path.node as t.Expression;
      const { parent } = path;
      ctx.lowered.add(value);
      path.replaceWith(box(ctx, value, info));
      if (t.isObjectProperty(parent)) parent.shorthand = false;
      return;
    }
    ctx.values.set(path.node, info);
    checkPosition(ctx, path);
  };

  return {
    // Names in types are not values: the `n` of `(n: number) => number` is not the reactive value `n`.
    // `typeof n` is left as written. After the replacement it is the type of the plain value
    [TYPES](path: NodePath) {
      path.skip();
    },

    Identifier(path) {
      if (ctx.lowered.has(path.node) || !path.isReferencedIdentifier()) return;
      const declared = path.scope.getBinding(path.node.name)?.identifier;
      if (!declared) return;

      if (declared === ctx.locals.reactive) return checkReactiveRef(path);
      if (declared === ctx.locals.$) {
        const parent = path.parentPath;
        if (!parent.isCallExpression() || parent.node.callee !== path.node) {
          fail(path, `\`${path.node.name}\` can only be called directly.`);
        }
        return;
      }

      const info = ctx.bindings.get(declared);
      if (info) produce(path, info);
    },

    CallExpression: {
      exit(path) {
        const { callee } = path.node;

        if (isReactiveMember(ctx, path.scope, callee, "new")) {
          const declarator = checkNewPosition(path);
          const [initial] = plainArguments(path, 1, "reactive.new");
          const info = ctx.bindings.get(declarator.node.id as t.Identifier)!;
          const state = t.callExpression(t.identifier(reactImport(ctx, path, "useState")), [
            // Given a function, useState treats it as a lazy initializer and calls it. Pass it as a value
            mayBeFunction(initial!) ? t.arrowFunctionExpression([], initial!) : initial!,
          ]);
          state.typeArguments = path.node.typeArguments ?? stateType(ctx, declarator);
          path.replaceWith(state);
          produce(path, { ...info, state: true });
          return;
        }

        if (isReactiveMember(ctx, path.scope, callee, "of")) {
          const [value] = plainArguments(path, 1, "reactive.of");
          path.replaceWith(value!);
          produce(path, {});
          return;
        }

        if (isReactiveMember(ctx, path.scope, callee, "from")) {
          const declarator = path.parentPath;
          if (
            !declarator.isVariableDeclarator() ||
            !t.isIdentifier(declarator.node.id) ||
            !declarator.parentPath.isVariableDeclaration({ kind: "const" })
          ) {
            fail(
              path,
              "The result of `reactive.from` must be bound directly: `const x = reactive.from(...)`.",
            );
          }
          const [value, update] = plainArguments(path, 2, "reactive.from");
          const id = (declarator.node as t.VariableDeclarator).id as t.Identifier;
          const info = ctx.bindings.get(id)!;
          const [inner] = path.node.typeArguments?.params ?? [];
          // `reactive.from` brings in a value that changes. A literal never does, so this is a mistake,
          // unless the type is written to say it is meant
          if (!inner && !id.typeAnnotation && isLiteralValue(path.scope, value!)) {
            fail(
              path.get("arguments.0") as NodePath,
              "The value given to `reactive.from` is a constant, so it never changes. " +
                "Pass the value that changes, such as the state of `useReducer`, or use `reactive.new` " +
                "for state of this component." +
                // Only TypeScript can say that the constant is meant
                (ctx.typescript
                  ? " If the constant is meant, write the type at the call, `reactive.from<T>(...)`, " +
                    "or on the variable, `const x: Reactive<T> = reactive.from(...)`."
                  : ""),
            );
          }
          path.replaceWith(value!);
          produce(path, {
            ...info,
            from: update!,
            fromType: t.isTSType(inner) ? inner : undefined,
          });
          return;
        }

        // The `$(r)` inside are already replaced by values. Unwrap and keep only the function
        if (isReactiveMember(ctx, path.scope, callee, "handler")) {
          const [f] = plainArguments(path, 1, "reactive.handler");
          if (!t.isArrowFunctionExpression(f) && !t.isFunctionExpression(f)) {
            fail(path, "`reactive.handler` takes a function: `reactive.handler((e) => { ... })`.");
          }
          path.replaceWith(f!);
          return;
        }

        if (isReactiveMember(ctx, path.scope, callee, "derive")) {
          const [block] = plainArguments(path, 1, "reactive.derive");
          path.replaceWith(lowerDo(path, block!));
          produce(path, {});
          return;
        }

        // The `$(r)` inside are already replaced by values. What is left is to list the dependencies
        if (isReactiveMember(ctx, path.scope, callee, "effect")) {
          const block = effectBlock(path);
          const dependencies = effectDependencies(ctx, block);
          path.replaceWith(
            t.callExpression(t.identifier(reactImport(ctx, path, "useEffect")), [
              block.node,
              t.arrayExpression(dependencies),
            ]),
          );
          return;
        }

        if (refersTo(path.scope, callee, ctx.locals.$)) {
          const [target] = plainArguments(path, 1, "$");
          if (!ctx.values.has(target!) && returnsReactive(ctx, target!)) {
            path.replaceWith(memberOf(target!, "value"));
            return;
          }
          if (!ctx.values.has(target!)) fail(path, "`$` expects a reactive value.");
          if (!isInsideBlock(ctx, path)) {
            fail(
              path,
              "`$` can only be used inside JSX `{...}`, a `reactive.derive` block, " +
                "a `reactive.handler` function, or a `reactive.effect` block.",
            );
          }
          consume(target!);
          ctx.reads.add(target!);
          path.replaceWith(target!);
          return;
        }

        if (!t.isMemberExpression(callee) || callee.computed) return;
        if (!t.isIdentifier(callee.property)) return;
        // Methods chained directly on a reactive value returned by a function, as in `useX().derive(f)`.
        // It is not bound to a variable, so it can only be read
        if (
          !ctx.values.has(callee.object) &&
          METHODS.has(callee.property.name) &&
          returnsReactive(ctx, callee.object)
        ) {
          callee.object = memberOf(callee.object as t.Expression, "value");
          ctx.values.set(callee.object, {});
        }
        const info = ctx.values.get(callee.object);
        if (!info) return;
        const method = callee.property.name;
        const target = callee.object as t.Expression;

        if (method === "derive") {
          const [f] = plainArguments(path, 1, "derive");
          consume(target);
          path.replaceWith(call(ctx, f!, [target]));
          produce(path, {});
        } else if (method === "update") {
          const [f] = plainArguments(path, 1, "update");
          if (!info.update) fail(path, "A derived value is read-only and cannot be updated.");
          if (!isInsideHandler(ctx, path)) {
            fail(path, "`update` can only be used inside an event handler, not during render.");
          }
          consume(target);
          path.replaceWith(info.update!(f!));
        } else if (method === "set") {
          const [value] = plainArguments(path, 1, "set");
          if (!info.update) fail(path, "A derived value is read-only and cannot be set.");
          if (!isInsideHandler(ctx, path)) {
            fail(path, "`set` can only be used inside an event handler, not during render.");
          }
          consume(target);
          // The updater may run after the handler has returned. A value read then can differ from the one
          // at the call (`e.currentTarget` is null by then), so anything but a constant is evaluated first
          path.replaceWith(
            isConstant(path, value!)
              ? info.update!(t.arrowFunctionExpression([], value!))
              : t.callExpression(replacer(ctx, info), [value!]),
          );
        } else if (method === "focus") {
          const [key] = plainArguments(path, 1, "focus");
          if (!t.isStringLiteral(key)) fail(path, "`focus` takes a string literal key.");
          if (!info.update) {
            fail(path, "A derived value is read-only and cannot be focused. Use `derive` instead.");
          }
          const name = (key as t.StringLiteral).value;
          consume(target);
          const { loc } = path.node;
          path.replaceWith(memberOf(target, name));
          // An error about the focused value points at the call
          if (loc) path.node.loc = loc;
          produce(path, { update: focusUpdate(ctx, info.update!, name) });
        } else if (method === "each") {
          plainArguments(path, 2, "each");
          const item = eachItem(path.node);
          const render = path.node.arguments[1] as t.ArrowFunctionExpression;
          if (!item || !t.isArrowFunctionExpression(render) || !t.isExpression(render.body)) {
            fail(
              path,
              "The second argument of `each` must be an arrow function " +
                "that takes one item and returns an expression: `item => <li>...</li>`.",
            );
          }
          const key = keyOfEach(ctx, path.node)(plain(ctx, item!.name));
          item!.typeAnnotation = null;
          render.body = withKey(ctx, path, render.body as t.Expression, key);
          consume(target);
          path.replaceWith(t.callExpression(memberOf(target, "map"), [render]));
        } else if (method === "when" || method === "match") {
          const branches = branchesOf(ctx, path.node, method, (message) => fail(path, message))!;
          for (const { handler } of branches) {
            const param = branchParam(handler);
            if (param) param.typeAnnotation = null;
          }
          consume(target);
          // Written for what the branches do, as in `user.when(isPresent, { narrowed: (u) => u.focus("name").set("") })`.
          // The result is not a value anyone uses, so there is no position to check
          const statement = path.parentPath;
          if (
            statement.isExpressionStatement() ||
            statement.isUnaryExpression({ operator: "void" })
          ) {
            if (!isInsideHandler(ctx, path)) {
              fail(
                path,
                `The result of \`${method}\` is not used. As a statement, \`${method}\` can only be used ` +
                  "inside an event handler, not during render.",
              );
            }
            if (statement.isExpressionStatement()) {
              statement.replaceWith(narrowStatement(ctx, target, branches));
            } else {
              path.replaceWith(narrow(ctx, target, branches));
            }
            return;
          }
          const { loc } = path.node;
          path.replaceWith(narrow(ctx, target, branches));
          ctx.narrowResults.add(path.node);
          // An error about where the result is used points at the call
          if (loc) path.node.loc = loc;
          produce(path, {});
        }
      },
    },

    MemberExpression: {
      exit(path) {
        if (ctx.lowered.has(path.node)) return;
        // Passed as a function without calling it, as in `onChange={value.set}`
        const { object, property, computed } = path.node;
        const held = ctx.values.get(object);
        const called =
          path.parentPath.isCallExpression() && path.parentPath.node.callee === path.node;
        if (held && !called && !computed && t.isIdentifier(property)) {
          if (property.name !== "update" && property.name !== "set") return;
          if (!held.update) fail(path, "A derived value is read-only and cannot be updated.");
          consume(object);
          path.replaceWith(property.name === "update" ? updater(ctx, held) : replacer(ctx, held));
          return;
        }
        const info = propInfo(ctx, path.node, path.scope);
        if (!info) return;
        ctx.lowered.add(path.node);
        path.replaceWith(memberOf(path.node, "value"));
        produce(path, info);
      },
    },

    VariableDeclarator: {
      exit(path) {
        const { id, init } = path.node;
        if (!init || !ctx.values.has(init)) return;
        const info = consume(init)!;
        if (!t.isIdentifier(id)) return;

        const annotation = id.typeAnnotation;
        id.typeAnnotation = null;
        if (info.from) {
          // Keep the updater in a variable. The expression is not re-evaluated on every `update`
          const setterId = t.identifier(info.setter!);
          // The updater was typed by the signature of `reactive.from`. Unless it has a type of its own,
          // the variable that keeps it says the same
          if (ctx.typescript && !isSelfTyped(info.from)) {
            const written = t.isTSTypeAnnotation(annotation)
              ? innerType(ctx, annotation.typeAnnotation)
              : null;
            setterId.typeAnnotation = updaterType(id.name, info.fromType ?? written);
          }
          const setter = t.variableDeclarator(setterId, info.from);
          const declarations = (path.parent as t.VariableDeclaration).declarations;
          const index = declarations.indexOf(path.node) + 1;
          declarations.splice(index, 0, setter);
          ctx.states.set(
            info.setter!,
            () => void declarations.splice(declarations.indexOf(setter), 1),
          );
          // An effect below depends on what the updater reads. It is found through its path
          const held = ctx.heldUpdaters.get(info.setter!);
          if (held) {
            held.updater = path.parentPath.get(
              `declarations.${index}.init`,
            ) as NodePath<t.Expression>;
          }
          return;
        }
        if (info.state) {
          const pattern = t.arrayPattern([id, t.identifier(info.setter!)]);
          ctx.states.set(info.setter!, () => void (pattern.elements.length = 1));
          path.get("id").replaceWith(pattern);
          return;
        }
        // Where `Derived<T>` is written, the type of the replaced value is `T`
        const inner = t.isTSTypeAnnotation(annotation) && innerType(ctx, annotation.typeAnnotation);
        if (inner) id.typeAnnotation = t.tsTypeAnnotation(inner);
      },
    },
  };
};

/** `reactive` can only be used in the form `reactive.new(...)` or `reactive.derive(...)` */
const checkReactiveRef = (path: NodePath<t.Identifier>): void => {
  const member = path.parentPath;
  const ok =
    member.isMemberExpression() &&
    member.node.object === path.node &&
    !member.node.computed &&
    t.isIdentifier(member.node.property) &&
    ["new", "of", "from", "handler", "derive", "effect"].includes(member.node.property.name) &&
    member.parentPath.isCallExpression() &&
    member.parentPath.node.callee === member.node;
  if (!ok) {
    fail(
      path,
      "`reactive` can only be used as `reactive.new(...)`, `.of`, `.from`, `.handler`, `.derive`, or `.effect`.",
    );
  }
};

const plainArguments = (
  path: NodePath<t.CallExpression>,
  count: number,
  name: string,
): t.Expression[] => {
  const args = path.node.arguments;
  if (args.length !== count || !args.every((arg) => t.isExpression(arg))) {
    fail(path, `\`${name}\` takes exactly ${count} argument${count === 1 ? "" : "s"}.`);
  }
  return args as t.Expression[];
};

/** The name of a function. `Counter` for `const Counter = () => ...` */
const functionName = (fn: NodePath<t.Function>): string | undefined => {
  if ((fn.isFunctionDeclaration() || fn.isFunctionExpression()) && fn.node.id) {
    return fn.node.id.name;
  }
  const parent = fn.parentPath;
  if (parent.isVariableDeclarator() && t.isIdentifier(parent.node.id)) return parent.node.id.name;
  return undefined;
};

const isComponentName = (name: string | undefined): boolean =>
  name === undefined || /^[A-Z]/.test(name);

const isHookName = (name: string | undefined): boolean =>
  name !== undefined && /^use[A-Z0-9]/.test(name);

/** Whether the function is written at the top level of a module. Components and custom hooks are written there */
const isTopLevelFunction = (fn: NodePath<t.Function>): boolean => fn.getFunctionParent() === null;

/**
 * `reactive.new` becomes `useState`, so it can only be called where the rules of hooks allow.
 * Only `const x = reactive.new(...)` at the top level of a component or custom hook body is allowed.
 */
const checkNewPosition = (path: NodePath<t.CallExpression>): NodePath<t.VariableDeclarator> => {
  const declarator = path.parentPath;
  if (
    !declarator.isVariableDeclarator() ||
    !t.isIdentifier(declarator.node.id) ||
    !declarator.parentPath.isVariableDeclaration({ kind: "const" })
  ) {
    return fail(
      path,
      "The result of `reactive.new` must be bound directly: `const x = reactive.new(...)`.",
    );
  }
  checkHookPosition(path, declarator.parentPath, "reactive.new");
  return declarator;
};

/**
 * `reactive.new` and `reactive.effect` become hooks, so they can only be called where the rules of hooks allow:
 * in a statement at the top level of the body of a component or a custom hook
 */
const checkHookPosition = (
  path: NodePath<t.CallExpression>,
  statement: NodePath,
  api: "reactive.new" | "reactive.effect",
): void => {
  const block = statement.parentPath;
  const fn = block?.parentPath;
  if (!block?.isBlockStatement() || !fn?.isFunction() || !isTopLevelFunction(fn)) {
    fail(
      path,
      `\`${api}\` can only be called at the top level of a component or a custom hook, ` +
        "not inside a condition, a loop, or a nested function.",
    );
  }
  const name = functionName(fn as NodePath<t.Function>);
  if (!isComponentName(name) && !isHookName(name)) {
    fail(path, `\`${api}\` can only be called in a component or a custom hook.`);
  }
};

/**
 * Whether it is inside a function defined within a component (an event handler), not in the render itself.
 *
 * A function the sugar calls during render is looked through: the block of `reactive.derive`, the function
 * of `r.derive(f)`, the `key` and `render` of `r.each(key, render)`, and a branch of `r.when` / `r.match`.
 * An `update` there would set state while rendering
 */
const isInsideHandler = (ctx: Context, path: NodePath): boolean => {
  for (let fn = path.getFunctionParent(); fn !== null; fn = fn.getFunctionParent()) {
    if (isTopLevelFunction(fn)) return false;
    if (!runsDuringRender(ctx, fn)) return true;
  }
  return false;
};

/** Whether the function is one the sugar calls during render, when the sugar around it is rendered */
const runsDuringRender = (ctx: Context, fn: NodePath<t.Function>): boolean => {
  if (isBranch(ctx, fn)) return true;
  const parent = fn.parentPath;
  if (!parent.isCallExpression()) return false;
  const { callee } = parent.node;
  const index = parent.node.arguments.indexOf(fn.node as t.Expression);
  if (index === 0 && isReactiveMember(ctx, parent.scope, callee, "derive")) return true;
  if (!t.isMemberExpression(callee) || !t.isExpression(callee.object)) return false;
  if (!isReactiveTarget(ctx, callee.object)) return false;
  return (
    (index === 0 && isMethodCall(parent.node, "derive")) ||
    (index >= 0 && index <= 1 && isMethodCall(parent.node, "each"))
  );
};

/**
 * Whether it is at a place where `$` can read a value: inside JSX `{...}`, inside the block of
 * `reactive.derive` / `reactive.effect`, or inside the function of `reactive.handler`.
 * Nested functions are fine in all of them
 */
const isInsideBlock = (ctx: Context, path: NodePath): boolean =>
  path.findParent((ancestor) => {
    // JSX `{...}` is evaluated on every render. It is treated as an implicit `reactive.derive`
    if (ancestor.isJSXExpressionContainer()) return true;
    const parent = ancestor.parentPath;
    return (
      ancestor.isFunction() &&
      parent !== null &&
      parent.isCallExpression() &&
      parent.node.arguments[0] === ancestor.node &&
      (isReactiveMember(ctx, parent.scope, parent.node.callee, "derive") ||
        isReactiveMember(ctx, parent.scope, parent.node.callee, "handler") ||
        isReactiveMember(ctx, parent.scope, parent.node.callee, "effect"))
    );
  }) !== null;

/** Turns the block of `reactive.derive(() => ...)` into an expression evaluated in place */
const lowerDo = (path: NodePath<t.CallExpression>, block: t.Expression): t.Expression => {
  if (
    !(t.isArrowFunctionExpression(block) || t.isFunctionExpression(block)) ||
    block.params.length !== 0 ||
    block.async ||
    block.generator
  ) {
    return fail(path, "`reactive.derive` takes a synchronous function with no parameters.");
  }
  if (t.isExpression(block.body)) return block.body;
  const [only] = block.body.body;
  if (block.body.body.length === 1 && t.isReturnStatement(only) && only.argument) {
    return only.argument;
  }
  return t.callExpression(t.arrowFunctionExpression([], block.body), []);
};

type EffectBlock = t.ArrowFunctionExpression | t.FunctionExpression;

/**
 * `reactive.effect` becomes `useEffect`, so it can only be called where the rules of hooks allow.
 * Only a statement `reactive.effect(() => { ... })` at the top level of a component or custom hook body
 * is allowed. Returns the block.
 */
const effectBlock = (path: NodePath<t.CallExpression>): NodePath<EffectBlock> => {
  const statement = path.parentPath;
  const fn = path.getFunctionParent();
  const top = fn !== null && isTopLevelFunction(fn);
  if (top && !statement.isExpressionStatement()) {
    return fail(path, "`reactive.effect` returns nothing. Its result cannot be used as a value.");
  }
  checkHookPosition(path, statement, "reactive.effect");

  const [block] = plainArguments(path, 1, "reactive.effect");
  if (
    !(t.isArrowFunctionExpression(block) || t.isFunctionExpression(block)) ||
    block.params.length !== 0 ||
    block.generator
  ) {
    return fail(
      path,
      "`reactive.effect` takes an inline function with no parameters: `reactive.effect(() => { ... })`.",
    );
  }
  if (block.async) {
    return fail(
      path,
      "The block of `reactive.effect` cannot be `async`. Call an async function inside it instead.",
    );
  }
  return path.get("arguments.0") as NodePath<EffectBlock>;
};

/** A plain value written as a name or as fixed keys under a name, as in `query` or `state.page` */
const dependencyKey = (node: t.Node): string | null => {
  if (t.isIdentifier(node)) return node.name;
  if (!t.isMemberExpression(node)) return null;
  const object = dependencyKey(node.object);
  const key = propertyKey(node.property, node.computed);
  return object === null || key === null ? null : `${object}.${JSON.stringify(key)}`;
};

/**
 * Lists the dependencies of the block of `reactive.effect`, in the order they appear.
 *
 * - a value read with `$(r)`, already replaced by the plain value
 * - a plain value declared in the component or the custom hook. The effect must not capture a stale one
 *
 * Module-level variables, globals, and variables of the block itself are not dependencies.
 * The setters the preprocessor generates are stable and are left out. The updater of `reactive.from` is
 * written in the component, so it is a new function on every render: what it reads is a dependency instead.
 */
const effectDependencies = (ctx: Context, block: NodePath<EffectBlock>): t.Expression[] => {
  const dependencies = new Map<string, t.Expression>();
  const owner = block.getFunctionParent()!;
  const [props] = isComponentName(functionName(owner)) ? owner.node.params : [];

  const add = (node: t.Expression): void => {
    const key = dependencyKey(node)!;
    if (dependencies.has(key)) return;
    const dependency = t.cloneNode(node, true);
    markLowered(ctx, dependency);
    dependencies.set(key, dependency);
  };

  /** The function being read for dependencies: the block, or the updater of `reactive.from` it calls */
  let root: NodePath = block;

  /** Whether the name is declared in the component or the custom hook, outside `root` */
  const isLocal = (path: NodePath, name: string): boolean => {
    const declaredIn = path.scope.getBinding(name)?.scope.path;
    if (!declaredIn || declaredIn.isProgram()) return false;
    return declaredIn.find((ancestor) => ancestor.node === root.node) === null;
  };

  /** The held updaters whose reads were collected. Each is read once */
  const collected = new Set<string>();

  /**
   * The dependency array is evaluated during render, at the place of the effect. A `const`, `let` or
   * `class` declared below it cannot be read there yet, although the block itself runs later
   */
  const checkDeclared = (path: NodePath, name: string, declaredAt: number | null | undefined) => {
    if (declaredAt == null || block.node.start == null || declaredAt < block.node.start) return;
    // A generated node, such as the setter of `r.update(f)`, has no position. Point at the effect then
    fail(
      path.node.loc ? path : block,
      `\`${name}\` is declared after this \`reactive.effect\`, which depends on it. ` +
        "Declare it before the effect.",
    );
  };

  const checkBinding = (path: NodePath, name: string): void => {
    const binding = path.scope.getBinding(name);
    if (binding?.kind === "const" || binding?.kind === "let") {
      checkDeclared(path, name, binding.identifier.start);
    }
  };

  const reference = (path: NodePath<t.Identifier | t.JSXIdentifier>): void => {
    const { name } = path.node;
    // The declaration of a held updater is generated, so the scope does not know it
    const held = ctx.heldUpdaters.get(name);
    const stable = ctx.usedSetters.has(name) && held === undefined;
    if (!path.isReferencedIdentifier() || stable) return;
    if (held === undefined && !isLocal(path, name)) return;
    if (held === undefined) checkBinding(path, name);
    else checkDeclared(path, held.name, held.start);
    if (held !== undefined) {
      // The updater is a function written in place: what it reads of the component is what can change.
      // One received as a value, such as `setState` or `props.onChange`, is the dependency itself
      if (collected.has(name)) return;
      collected.add(name);
      if (held.updater) {
        const outer = root;
        root = held.updater;
        if (held.updater.isFunction()) held.updater.traverse(visitors);
        else visit(held.updater);
        root = outer;
        return;
      }
    }
    // `props` is a new object on every render. Depend on the prop that is read
    const member = path.parent;
    const ofProps =
      props !== undefined &&
      path.scope.getBinding(name)?.identifier === props &&
      t.isMemberExpression(member) &&
      member.object === path.node &&
      dependencyKey(member) !== null;
    add(ofProps ? (member as t.MemberExpression) : t.identifier(name));
  };

  const member = (path: NodePath<t.MemberExpression>): boolean => {
    const { node } = path;
    // `$(state.focus("page"))` depends on `state.page`, not on the whole `state`
    const read = ctx.reads.has(node) && dependencyKey(node) !== null;
    // A reactive prop is `{ value, update }`. The value is a dependency. `update` is treated as stable
    const prop = t.isMemberExpression(node.object) && propInfo(ctx, node.object, path.scope);
    if (!read && !prop) return false;
    const base = dependencyKey(node)?.split(".")[0];
    const value = read || propertyKey(node.property, node.computed) === "value";
    if (value && base !== undefined && isLocal(path, base)) {
      checkBinding(path, base);
      add(node);
    }
    return true;
  };

  const visitors = {
    // Names in types are not values
    "TSType|TSTypeAnnotation|TSTypeParameterInstantiation"(path: NodePath) {
      path.skip();
    },
    Identifier: reference,
    JSXIdentifier: reference,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (member(path)) path.skip();
    },
  };

  /** Reads one expression, which `traverse` would not visit itself */
  const visit = (path: NodePath): void => {
    if (path.isIdentifier() || path.isJSXIdentifier()) reference(path);
    else if (path.isMemberExpression() && member(path)) return;
    else path.traverse(visitors);
  };

  block.traverse(visitors);
  return [...dependencies.values()];
};

/** Whether the initial value may be a function. A literal is known not to be one */
const mayBeFunction = (node: t.Expression): boolean => {
  if (t.isLiteral(node) || t.isObjectExpression(node) || t.isArrayExpression(node)) return false;
  if (t.isUnaryExpression(node) || t.isBinaryExpression(node)) return false;
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return false;
  return true;
};

/** The `T` of `Reactive<T>` / `Derived<T>` */
const innerType = (ctx: Context, type: t.TSType): t.TSType | null => {
  if (!t.isTSTypeReference(type) || !t.isIdentifier(type.typeName)) return null;
  if (!ctx.typeLocals.has(type.typeName.name)) return null;
  const [inner] = type.typeArguments?.params ?? [];
  return inner ?? null;
};

const stateType = (
  ctx: Context,
  declarator: NodePath<t.VariableDeclarator>,
): t.TSTypeParameterInstantiation | null => {
  const annotation = (declarator.node.id as t.Identifier).typeAnnotation;
  if (!t.isTSTypeAnnotation(annotation)) return null;
  const inner = innerType(ctx, annotation.typeAnnotation);
  return inner ? t.tsTypeParameterInstantiation([inner]) : null;
};

/** Uses an export of `react`. Returns its name if already imported, otherwise a new name */
const reactImport = (ctx: Context, path: NodePath, exported: string): string => {
  const known = ctx.reactImports.get(exported);
  if (known) return known.name;
  const program = path.findParent((p) => p.isProgram()) as NodePath<t.Program>;
  for (const statement of program.node.body) {
    if (!t.isImportDeclaration(statement) || statement.source.value !== "react") continue;
    if (statement.importKind === "type") continue;
    for (const specifier of statement.specifiers) {
      if (
        t.isImportSpecifier(specifier) &&
        specifier.importKind !== "type" &&
        t.isIdentifier(specifier.imported, { name: exported })
      ) {
        ctx.reactImports.set(exported, { name: specifier.local.name, needsImport: false });
        return specifier.local.name;
      }
    }
  }
  const name = freshName(ctx, exported);
  ctx.reactImports.set(exported, { name, needsImport: true });
  return name;
};

/** Adds `key` to an expression rendered as a list item */
const withKey = (
  ctx: Context,
  path: NodePath,
  body: t.Expression,
  key: t.Expression,
): t.Expression => {
  const attribute = t.jsxAttribute(t.jsxIdentifier("key"), t.jsxExpressionContainer(key));
  if (t.isJSXElement(body)) {
    const attributes = body.openingElement.attributes;
    const hasKey = attributes.some(
      (a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: "key" }),
    );
    // Placed after the spread, it is not overwritten by a key inside the spread
    if (!hasKey) {
      attributes.push(attribute);
      return body;
    }
  }
  const fragment = t.jsxIdentifier(reactImport(ctx, path, "Fragment"));
  const child =
    t.isJSXElement(body) || t.isJSXFragment(body) ? body : t.jsxExpressionContainer(body);
  return t.jsxElement(
    t.jsxOpeningElement(fragment, [attribute]),
    t.jsxClosingElement(t.cloneNode(fragment)),
    [child],
  );
};

/** Whether it is a call of the sugar. The preprocessor handles its arguments itself */
const isSugarCall = (ctx: Context, path: NodePath<t.CallExpression | t.NewExpression>): boolean => {
  const { callee } = path.node;
  if (refersTo(path.scope, callee, ctx.locals.$)) return true;
  if (!t.isMemberExpression(callee)) return false;
  return refersTo(path.scope, callee.object, ctx.locals.reactive) || ctx.values.has(callee.object);
};

/** Whether the called function takes a reactive value as its `index`-th argument */
const acceptsReactive = (
  ctx: Context,
  path: NodePath<t.CallExpression | t.NewExpression>,
  index: number,
): boolean => {
  const { callee } = path.node;
  // Without types, only calls of custom hooks are let through
  if (!ctx.types) return t.isIdentifier(callee) && isHookName(callee.name);
  const name = t.isMemberExpression(callee) && !callee.computed ? callee.property : callee;
  if (!t.isIdentifier(name) || name.start == null) return false;
  const [answer] = ask(ctx, path, [{ position: name.start, of: "params", index }]);
  return answer?.kind === "Reactive" || answer?.kind === "Derived";
};

/** Whether the component declares the prop of that attribute as a reactive value */
const expectsReactive = (
  ctx: Context,
  attribute: NodePath<t.JSXAttribute>,
  tag: t.JSXOpeningElement["name"],
): boolean => {
  const { name } = attribute.node;
  if (!t.isJSXIdentifier(name)) return false;
  // Without types, only components declared in the same file are known
  if (!ctx.types) {
    return t.isJSXIdentifier(tag) && ctx.components.get(tag.name)?.has(name.name) === true;
  }
  const target = t.isJSXMemberExpression(tag) ? tag.property : tag;
  if (target.start == null) return false;
  const [answer] = ask(ctx, attribute, [
    { position: target.start, of: "attribute", name: name.name },
  ]);
  return answer?.kind != null;
};

/** The React hooks that take a dependency array, and the position of that argument */
const DEPENDENCIES = new Map([
  ["useEffect", 1],
  ["useLayoutEffect", 1],
  ["useInsertionEffect", 1],
  ["useMemo", 1],
  ["useCallback", 1],
  ["useImperativeHandle", 2],
]);

/** Whether the expression is an item of the dependency array of a React hook, as in `useEffect(f, [r])` */
const isDependency = (path: NodePath): boolean => {
  const array = path.parentPath;
  const hook = array?.parentPath;
  if (!array?.isArrayExpression() || !hook?.isCallExpression()) return false;
  const { callee } = hook.node;
  const name = t.isMemberExpression(callee) && !callee.computed ? callee.property : callee;
  if (!t.isIdentifier(name)) return false;
  return hook.node.arguments[DEPENDENCIES.get(name.name) ?? -1] === array.node;
};

/**
 * Whether a reactive value is at a position that crosses a function boundary.
 *
 * - an attribute of a component
 * - an argument of a function that takes a reactive value
 * - the return value of a custom hook
 *
 * The contents of an object / array literal placed directly at these positions are included.
 */
const isBoxPosition = (ctx: Context, path: NodePath): boolean => {
  let current = path;
  let nested = false;
  for (;;) {
    const parent = current.parentPath;
    if (!parent) return false;
    const inObject =
      parent.isObjectProperty() &&
      parent.node.value === current.node &&
      parent.parentPath.isObjectExpression();
    if (!inObject && !parent.isArrayExpression()) break;
    current = inObject ? parent.parentPath : parent;
    nested = true;
  }
  const parent = current.parentPath!;

  if (parent.isJSXExpressionContainer()) {
    const element = parent.parentPath.parentPath;
    if (!parent.parentPath.isJSXAttribute() || !element?.isJSXOpeningElement()) return false;
    const tag = element.node.name;
    const component =
      t.isJSXMemberExpression(tag) || (t.isJSXIdentifier(tag) && /^[A-Z]/.test(tag.name));
    // Passed as is only to a prop the receiver declares as a reactive value.
    // Other attributes get the plain value
    const attribute = parent.parentPath as NodePath<t.JSXAttribute>;
    return component && expectsReactive(ctx, attribute, tag);
  }

  if (parent.isCallExpression() || parent.isNewExpression()) {
    const index = parent.node.arguments.indexOf(current.node as t.Expression);
    if (index < 0 || isSugarCall(ctx, parent)) return false;
    return nested || acceptsReactive(ctx, parent, index);
  }

  const returned =
    parent.isReturnStatement() ||
    (parent.isArrowFunctionExpression() && parent.node.body === current.node);
  if (!returned) return false;
  const fn = current.getFunctionParent();
  return fn !== null && isTopLevelFunction(fn) && isHookName(functionName(fn));
};

/**
 * Checks that a replaced expression (a plain value) is at a position where a reactive value may be placed.
 *
 * At the type level it is still `Derived<T>`, so the type checker rejects uses as a plain value.
 * Places that slip past the type checker, such as template literals and conditions, are stopped here.
 */
const checkPosition = (ctx: Context, path: NodePath): void => {
  const parent = path.parentPath;
  if (!parent) return;
  const node = path.node;

  if (parent.isMemberExpression() && parent.node.object === node) {
    const property = parent.node.property;
    const called =
      parent.parentPath.isCallExpression() && parent.parentPath.node.callee === parent.node;
    const known = !parent.node.computed && t.isIdentifier(property) && METHODS.has(property.name);
    if (known && called) return;
    // `update` and `set` can be passed as functions without calling them
    if (known && ["update", "set"].includes((property as t.Identifier).name)) return;
    const name =
      !parent.node.computed && t.isIdentifier(property) ? `\`${property.name}\`` : "this";
    fail(
      parent,
      `A reactive value has no ${name} member. ` +
        "Use `derive`, `update`, `set`, `focus`, `each`, `when`, or `match`.",
    );
  }

  if (parent.isCallExpression() && parent.node.callee !== node) {
    const { callee } = parent.node;
    if (refersTo(parent.scope, callee, ctx.locals.$)) return;
  }

  if (parent.isVariableDeclarator() && parent.node.init === node) {
    if (
      t.isIdentifier(parent.node.id) &&
      parent.parentPath.isVariableDeclaration({ kind: "const" })
    ) {
      return;
    }
    fail(parent, "A reactive value must be bound with `const` to a single name.");
  }

  if (parent.isJSXExpressionContainer()) {
    // Inside JSX it can be used as a value as is, both as a child and as an attribute
    return;
  }

  const returned =
    parent.isReturnStatement() || (parent.isArrowFunctionExpression() && parent.node.body === node);
  if (returned) {
    const fn = path.getFunctionParent();
    if (fn && isTopLevelFunction(fn) && isComponentName(functionName(fn))) return;
    // The value returned by the render of `each` is rendered
    const each = fn?.parentPath;
    if (
      fn &&
      each?.isCallExpression() &&
      isMethodCall(each.node, "each") &&
      each.node.arguments[1] === fn.node &&
      isReactiveTarget(ctx, each.node.callee.object)
    ) {
      return;
    }
    // The value returned by a branch of `when` / `match` becomes the value of the whole
    if (fn && isBranch(ctx, fn)) return;
    // `onClick={() => r.when(...)}` reads as a statement, but the arrow function returns the result
    if (ctx.narrowResults.has(node)) {
      fail(
        path,
        "The result of `when` / `match` is returned from a function here. To use it for what its branches do, " +
          "write it as a statement: `() => { r.when(...); }`.",
      );
    }
  }

  fail(
    path,
    "A reactive value cannot be used as a plain value here. " +
      "Derive from it with `derive` / `reactive.derive`, or embed it in JSX.",
  );
};

/** Whether the function is a branch of `r.when(...)` / `r.match(...)` on a reactive value */
const isBranch = (ctx: Context, fn: NodePath<t.Function>): boolean => {
  // Both take their branches as the properties of an object literal, the second argument
  const parent = fn.parentPath;
  if (!parent.isObjectProperty() || parent.node.value !== fn.node) return false;
  const owner = parent.parentPath.parentPath;
  if (!owner?.isCallExpression()) return false;
  return (
    isMethodCall(owner.node, "when", "match") &&
    owner.node.arguments[1] === parent.parent &&
    isReactiveTarget(ctx, owner.node.callee.object)
  );
};

/**
 * Whether a method is being called on a reactive value. A value returned by a hook, as in `useX().when(...)`,
 * is only registered when the call is left, after the functions passed to it were checked
 */
const isReactiveTarget = (ctx: Context, target: t.Expression): boolean =>
  ctx.values.has(target) || returnsReactive(ctx, target);

/** Removes the imports of the sugar and adds the `react` imports the output uses */
const finishImports = (program: NodePath<t.Program>, ctx: Context): void => {
  const values = new Set<t.Node>(Object.values(ctx.locals));
  for (const statement of program.get("body")) {
    if (!statement.isImportDeclaration() || statement.node.source.value !== ctx.importSource) {
      continue;
    }
    const rest = statement.node.specifiers.filter((specifier) => !values.has(specifier.local));
    if (rest.length === 0) {
      statement.remove();
      continue;
    }
    // Only types remain
    statement.node.specifiers = rest;
    statement.node.importKind = "type";
    for (const specifier of rest) {
      if (t.isImportSpecifier(specifier)) specifier.importKind = null;
    }
  }

  const specifiers = [...ctx.reactImports]
    .filter(([, { needsImport }]) => needsImport)
    .map(([exported, { name }]) => t.importSpecifier(t.identifier(name), t.identifier(exported)));
  if (specifiers.length > 0) {
    program.unshiftContainer("body", t.importDeclaration(specifiers, t.stringLiteral("react")));
  }
};
