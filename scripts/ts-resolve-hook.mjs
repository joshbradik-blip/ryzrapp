// Test-only resolver: lets node's built-in TypeScript type-stripping run our
// app sources, which use extensionless relative imports (the TS/Metro
// convention) that plain ESM resolution does not understand.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[mc]?[jt]sx?$/.test(specifier)) {
      const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
      const base = new URL(specifier, pathToFileURL(parent));
      for (const candidate of [`${base.pathname}.ts`, `${base.pathname}/index.ts`]) {
        if (existsSync(candidate)) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
