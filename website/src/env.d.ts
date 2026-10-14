declare module "*?demo" {
  const demo: { source: string; output: string };
  export default demo;
}

declare module "*?rejected" {
  const rejected: { source: string; error: string };
  export default rejected;
}
