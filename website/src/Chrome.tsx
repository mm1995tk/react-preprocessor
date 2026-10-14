import type { ReactNode } from "react";

const base = import.meta.env.BASE_URL;

export const links = {
  home: base,
  github: "https://github.com/mm1995tk/react-preprocessor",
  readme: "https://github.com/mm1995tk/react-preprocessor#readme",
  api: "https://github.com/mm1995tk/react-preprocessor#api",
  rejects: "https://github.com/mm1995tk/react-preprocessor#what-the-preprocessor-rejects",
  cli: "https://github.com/mm1995tk/react-preprocessor#cli",
  npm: "https://www.npmjs.com/package/react-preprocessor",
  source: "https://github.com/mm1995tk/react-preprocessor/tree/main/website",
};

export const Header = () => (
  <header className="site-header">
    <a className="brand" href={links.home}>
      <span className="brand-mark" aria-hidden="true">
        {"=>"}
      </span>
      react-preprocessor
    </a>
    <nav aria-label="Site">
      <a href="#try">Try it</a>
      <a href={links.readme}>Docs</a>
      <a href={links.github}>GitHub</a>
      <a href={links.npm}>npm</a>
    </nav>
  </header>
);

export const Footer = ({ children }: { children?: ReactNode }) => (
  <footer className="site-footer">
    <p>
      MIT License. Experimental: the API is still changing. {children}
      <a href={links.source}>This site is written with react-preprocessor.</a>
    </p>
  </footer>
);
