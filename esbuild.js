const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Copy chord-mark UMD bundle into media/ so the webview can load it */
function copyChordMarkLib() {
  const src = path.join(__dirname, 'node_modules', 'chord-mark', 'lib', 'chord-mark.js');
  const dest = path.join(__dirname, 'media', 'chord-mark.js');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('Copied chord-mark.js → media/chord-mark.js');
}

async function main() {
  copyChordMarkLib();

  const ctx = await esbuild.context({
    bundle: true,
    platform: 'node',
    target: 'node18',
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
    logLevel: 'info',
    entryPoints: ['src/extension.ts'],
    outfile: 'out/extension.js',
    format: 'cjs',
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
