import { mkdir, readFile, writeFile } from 'fs/promises';
import { defineConfig, logger } from 'tsdown';
import { resolve } from 'path';
import { parse } from 'json5';

const setupDeploy = async () => {
  logger.info('Setting up deployment files');
  const config = await parse(await readFile('./wrangler.jsonc', 'utf-8'));

  await mkdir('./.wrangler/deploy', { recursive: true });

  await writeFile(
    './.wrangler/deploy/config.json',
    JSON.stringify({
      configPath: '../../dist/wrangler.json',
      auxiliaryWorkers: [],
    }),
  );

  const path = resolve('./wrangler.jsonc');

  const env =
    process.argv.indexOf('--env') > -1
      ? (process.argv[process.argv.indexOf('--env') + 1] ?? 'production')
      : 'production';

  logger.info(`Using environment: ${env}`);

  const envConfig = config.env[env];

  delete config.env;
  delete config['$schema'];

  const deployWranglerConfig = {
    ...config,
    name: config.name,
    topLevelName: config.name,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    main: 'main.js',
    no_bundle: true,
    configPath: path,
    userConfigPath: path,
    ...envConfig,
  };

  await writeFile('./dist/wrangler.json', JSON.stringify(deployWranglerConfig));
};

export default defineConfig({
  entry: ['./src/main.ts'],
  outDir: './dist',
  format: 'esm',
  treeshake: true,
  clean: true,
  external: ['cloudflare:workers'],
  target: 'esnext',
  noExternal: [/(.*)/],
  env: {
    NODE_ENV: 'production',
  },
  outputOptions: {
    esModule: true,
  },
  onSuccess: setupDeploy,
});
