const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  setupFiles: ["dotenv/config"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: false }],
    "^.+\\.jsx?$": ["ts-jest", {
      useESM: false,
      tsconfig: {
        allowJs: true,
        module: "commonjs",
        target: "ES2020",
        moduleResolution: "node",
        esModuleInterop: true,
      },
    }],
  },
  transformIgnorePatterns: [
    "^(?!.*@noble[/+](ed25519|hashes)).*node_modules",
  ],
};