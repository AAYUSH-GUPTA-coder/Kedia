import { ADDRESSES_FILE, CHAIN, FACTORY, HOST, NETWORK, PORT, SIMULATE_ONLY } from './config.ts';
import { startLoop } from './agent.ts';
import { startServer } from './server.ts';

if (/^0x0+$/.test(FACTORY)) {
  throw new Error({
    fork: 'ABI/addresses.fork.json has no factory. Run `pnpm fork:setup` with the fork running first.',
    testnet: 'ABI/addresses.testnet.json has no factory yet. Deploy with SmartContracts/script/DeployTestnet.s.sol first.',
    mainnet: 'ABI/addresses.json has no mainnet factory yet. For testnet run `pnpm backend:testnet`; for the local fork demo run `pnpm fork:setup`, then `pnpm backend:fork`. For mainnet, deploy with SmartContracts/script/Deploy.s.sol first.',
  }[NETWORK]);
}
console.log(`${CHAIN.name} (${ADDRESSES_FILE}) · factory ${FACTORY}${SIMULATE_ONLY ? ' (SIMULATE_ONLY: no transactions will be sent)' : ''}`);
startServer(HOST, PORT);
if (process.env.AGENT !== 'off') startLoop();
