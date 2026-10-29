import { FACTORY, FORK, HOST, PORT, SIMULATE_ONLY } from './config.ts';
import { startLoop } from './agent.ts';
import { startServer } from './server.ts';

if (/^0x0+$/.test(FACTORY)) {
  throw new Error(FORK
    ? 'ABI/addresses.fork.json has no factory. Run `pnpm fork:setup` with the fork running first.'
    : 'ABI/addresses.json has no mainnet factory yet. For the local fork demo run `pnpm fork:setup`, then `pnpm backend:fork`. For mainnet, deploy with SmartContracts/script/Deploy.s.sol first.');
}
console.log(`Factory ${FACTORY}${SIMULATE_ONLY ? ' (SIMULATE_ONLY: no transactions will be sent)' : ''}`);
startServer(HOST, PORT);
if (process.env.AGENT !== 'off') startLoop();
