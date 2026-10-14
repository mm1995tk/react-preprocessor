{
  description = "react-preprocessor: syntactic sugar and a preprocessor that bring type-driven discipline to React state";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    treefmt-nix.url = "github:numtide/treefmt-nix";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    treefmt-nix,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};

      treefmtEval = treefmt-nix.lib.evalModule pkgs ./flake-fmt.nix;
    in {
      devShells = import ./flake-shell.nix {inherit pkgs;};

      formatter = treefmtEval.config.build.wrapper;
      checks.formatting = treefmtEval.config.build.check self;
    });
}
