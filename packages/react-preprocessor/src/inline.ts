import { types as t } from "@babel/core";

/**
 * Builds an expression for `f(...args)`.
 *
 * When `f` is an arrow function with an expression body and the replacement provably keeps the meaning,
 * the arguments are inlined into the body and no call remains (`cnt * 2`, not `(n => n * 2)(cnt)`).
 * Otherwise the call form is returned. Both evaluate to the same value.
 */
export const apply = (
  f: t.Expression,
  args: t.Expression[],
  onClone: (clone: t.Expression) => void,
): t.Expression => inline(f, args, onClone) ?? t.callExpression(f, args);

type Slot = { get: () => t.Node; set: (node: t.Expression) => void };

type Occurrence = { slot: Slot; parent: t.Node; inNestedFunction: boolean };

const inline = (
  f: t.Expression,
  args: t.Expression[],
  onClone: (clone: t.Expression) => void,
): t.Expression | null => {
  if (!t.isArrowFunctionExpression(f) || f.async || !t.isExpression(f.body)) return null;
  // Arguments beyond the parameters are unused. Arguments are already-lowered values, so skipping their evaluation keeps the meaning
  if (f.params.length > args.length) return null;

  const params: string[] = [];
  for (const param of f.params) {
    if (!t.isIdentifier(param)) return null;
    params.push(param.name);
  }
  if (new Set(params).size !== params.length) return null;

  // Names declared inside the body. One equal to a parameter shadows the parameter,
  // and one equal to a name in an argument captures the inlined argument. Both cancel the inlining.
  const declared = declaredNames(f.body);
  const argNames = new Set(args.flatMap((arg) => [...identifierNames(arg)]));
  for (const name of declared) {
    if (params.includes(name) || argNames.has(name)) return null;
  }

  const holder = { body: f.body };
  const occurrences = new Map<string, Occurrence[]>(params.map((name) => [name, []]));
  let safe = true;

  walk(holder.body, holder, { get: () => holder.body, set: (n) => (holder.body = n) }, 0, {
    visit(node, parent, grandparent, slot, depth) {
      if (t.isJSXIdentifier(node) && params.includes(node.name)) {
        // `<n.Foo />` refers to the parameter. A JSX name cannot be replaced by an expression
        if (t.isJSXMemberExpression(parent) && parent.object === node) safe = false;
        return;
      }
      if (!t.isIdentifier(node) || !params.includes(node.name)) return;
      if (isPropertyName(node, parent)) return;
      if (!t.isReferenced(node, parent, grandparent) || isWriteTarget(node, parent)) {
        safe = false;
        return;
      }
      occurrences.get(node.name)?.push({ slot, parent, inNestedFunction: depth > 0 });
    },
  });
  if (!safe) return null;

  // Copying an argument other than an identifier or a property access repeats its computation. Inline it only when it is evaluated exactly once, in place
  for (const [index, name] of params.entries()) {
    const arg = args[index]!;
    const found = occurrences.get(name)!;
    if (isCheap(arg)) continue;
    if (found.length !== 1 || found[0]!.inNestedFunction) return null;
  }

  for (const [index, name] of params.entries()) {
    const arg = args[index]!;
    for (const { slot, parent } of occurrences.get(name)!) {
      if (t.isObjectProperty(parent) && parent.shorthand) parent.shorthand = false;
      const clone = t.cloneNode(arg, true);
      onClone(clone);
      slot.set(clone);
    }
  }
  return holder.body;
};

type Visitor = {
  visit(
    node: t.Node,
    parent: t.Node,
    grandparent: t.Node | undefined,
    slot: Slot,
    depth: number,
  ): void;
};

const walk = (
  node: t.Node,
  parent: object,
  slot: Slot,
  depth: number,
  visitor: Visitor,
  grandparent?: t.Node,
): void => {
  visitor.visit(node, parent as t.Node, grandparent, slot, depth);
  // Do not replace during the visit. Replacements are done together after the traversal
  const childDepth = t.isFunction(node) ? depth + 1 : depth;
  const record = node as unknown as Record<string, unknown>;
  for (const key of t.VISITOR_KEYS[node.type] ?? []) {
    const child = record[key];
    if (Array.isArray(child)) {
      for (const [index, item] of child.entries()) {
        if (!isNode(item)) continue;
        const itemSlot: Slot = { get: () => child[index], set: (n) => (child[index] = n) };
        walk(item, node, itemSlot, childDepth, visitor, parent as t.Node);
      }
    } else if (isNode(child)) {
      const childSlot: Slot = { get: () => record[key] as t.Node, set: (n) => (record[key] = n) };
      walk(child, node, childSlot, childDepth, visitor, parent as t.Node);
    }
  }
};

/** An expression that can be copied without adding computation: `a` or `a.b.c` */
export const isCheap = (node: t.Expression): boolean =>
  t.isIdentifier(node) ||
  (t.isMemberExpression(node) &&
    !node.computed &&
    t.isExpression(node.object) &&
    isCheap(node.object));

const isNode = (value: unknown): value is t.Node =>
  typeof value === "object" && value !== null && typeof (value as t.Node).type === "string";

/** A name that does not refer to a variable, like `n` in `obj.n` or in `{ n: 1 }` */
const isPropertyName = (node: t.Identifier, parent: t.Node): boolean => {
  if (t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) {
    return parent.property === node && !parent.computed;
  }
  if (t.isObjectProperty(parent) || t.isObjectMethod(parent) || t.isClassMethod(parent)) {
    // In the shorthand `{ n }` the key and the value are separate nodes. Only the value side is a reference
    return (
      parent.key === node &&
      !parent.computed &&
      !(t.isObjectProperty(parent) && parent.value === node)
    );
  }
  if (t.isClassProperty(parent)) return parent.key === node && !parent.computed;
  return false;
};

const isWriteTarget = (node: t.Identifier, parent: t.Node): boolean =>
  (t.isAssignmentExpression(parent) && parent.left === node) ||
  (t.isUpdateExpression(parent) && parent.argument === node);

const declaredNames = (root: t.Node): Set<string> => {
  const names = new Set<string>();
  const add = (node: t.Node | null | undefined): void => {
    if (!node) return;
    for (const name of Object.keys(t.getBindingIdentifiers(node))) names.add(name);
  };
  const holder = { root };
  walk(root, holder, { get: () => root, set: () => {} }, 0, {
    visit(node) {
      if (t.isFunction(node)) {
        for (const param of node.params) add(param);
        if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) add(node.id);
      } else if (t.isVariableDeclaration(node)) {
        add(node);
      } else if (t.isClassDeclaration(node) || t.isClassExpression(node)) {
        add(node.id);
      } else if (t.isCatchClause(node)) {
        add(node.param);
      }
    },
  });
  return names;
};

const identifierNames = (root: t.Node): Set<string> => {
  const names = new Set<string>();
  const holder = { root };
  walk(root, holder, { get: () => root, set: () => {} }, 0, {
    visit(node) {
      if (t.isIdentifier(node) || t.isJSXIdentifier(node)) names.add(node.name);
    },
  });
  return names;
};

export const forEachNode = (root: t.Node, f: (node: t.Node) => void): void => {
  const holder = { root };
  walk(root, holder, { get: () => root, set: () => {} }, 0, { visit: f });
};
