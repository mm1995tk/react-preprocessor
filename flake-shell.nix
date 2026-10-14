{pkgs}: {
  # nix provides Node, pnpm, and the browser for tests. npm libraries are pinned by pnpm-lock.yaml
  default = pkgs.mkShell {
    buildInputs = with pkgs; [
      nodejs_26
      pnpm
      alejandra
      chromium
    ];

    env = {
      # The browser started by the E2E tests of the examples. The npm side (playwright-core) must not download one
      CHROMIUM_PATH = "${pkgs.chromium}/bin/chromium";
    };
  };
}
