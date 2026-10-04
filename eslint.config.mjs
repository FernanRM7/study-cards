import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Fluid's registry implementation keeps stable selection IDs in refs.
  // Preserve the upstream component; these refs do not hold render state.
  {
    files: ["src/components/ui/checkbox-group.tsx"],
    rules: {
      "react-hooks/refs": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { varsIgnorePattern: "^_" }],
    },
  },
  // Keep Fluid's upstream mount-only ref that skips the initial dot animation.
  {
    files: ["src/components/ui/radio-group.tsx"],
    rules: { "react-hooks/refs": "off" },
  },
  {
    files: ["src/components/ui/dialog.tsx"],
    rules: { "@typescript-eslint/no-unused-vars": ["warn", { varsIgnorePattern: "^_" }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
