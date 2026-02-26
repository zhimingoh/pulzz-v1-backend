module.exports = {
  root: true,
  env: {
    node: true,
    es2023: true
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest"
  },
  rules: {
    "no-console": "off"
  }
};
