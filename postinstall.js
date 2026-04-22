#!/usr/bin/env node
// Printed only on global installs. Local/dev installs stay silent.
if (process.env.npm_config_global !== 'true') process.exit(0);

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const dim  = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

console.log('');
console.log(bold('⚡  ClaudeXP installed.'));
console.log(`   Run ${cyan('claudexp setup')} to claim your name and install the Stop hook.`);
console.log(dim('   (or just ') + cyan('claudexp stats') + dim(' to see your local profile)'));
console.log('');
