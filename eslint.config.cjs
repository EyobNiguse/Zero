const path = require("path");

/** @type {import("eslint").Linter.Config} */
const config = {
  root: true,
  extends: ["@zero/eslint-config"],
  parserOptions: {
    project: path.join(__dirname, "tsconfig.json"),
  },
};

module.exports = config;
