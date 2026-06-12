import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**"]
  },
  {
    files: ["js/**/*.js", "*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error"
    }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.vitest }
    }
  }
];
