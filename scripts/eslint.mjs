// Flat ESLint config for scripts/analyze.js-ts.sh.
// Loads the rule set from eslint.rules.json, optionally narrowed to the
// comma-separated rule ids in ESLINT_REFACTOR_METRICS_ONLY (set by --only/-o).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rulesJsonPath = path.join(__dirname, "eslint.rules.json");
const allRuleIds = Object.keys(
  JSON.parse(fs.readFileSync(rulesJsonPath, "utf8")),
);

const only = (process.env.ESLINT_REFACTOR_METRICS_ONLY ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const activeRuleIds = only.length > 0
  ? allRuleIds.filter((id) => only.includes(id))
  : allRuleIds;

// Options for the rules above; a plain "error" is used for any id without specific options.
const ruleOptions = {
  complexity: ["error", 15],
  "max-depth": ["error", 4],
  "max-params": ["error", 4],
  "max-lines-per-function": [
    "error",
    { max: 80, skipBlankLines: true, skipComments: true },
  ],
  "max-nested-callbacks": ["error", 3],
};

const rules = Object.fromEntries(
  activeRuleIds.map((id) => [id, ruleOptions[id] ?? "error"]),
);

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
      "vitest.config.ts",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: {
          // Test files and vitest.config.ts are excluded from package tsconfigs; ** is not allowed.
          allowDefaultProject: ["packages/*/src/*.test.ts", "vitest.config.ts"],
          defaultProject: "./tsconfig.json",
        },
        tsconfigRootDir: path.join(import.meta.dirname, ".."),
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules,
  },
  {
    // Approval test suites wrap all cases in a single describe callback; max-lines doesn't apply.
    files: ["**/*.approval.test.ts"],
    rules: { "max-lines-per-function": "off" },
  },
];
