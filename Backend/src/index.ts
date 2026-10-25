import { PORT, SIMULATE_ONLY, VAULT } from './config.ts';
import { startLoop } from './agent.ts';
import { startServer } from './server.ts';

if (/^0x0+$/.test(VAULT)) throw new Error('ABI/addresses.json has no vault yet. Deploy with SmartContracts/script/Deploy.s.sol first.');
console.log(`Vault ${VAULT}${SIMULATE_ONLY ? ' (SIMULATE_ONLY: no transactions will be sent)' : ''}`);
startServer(PORT);
if (process.env.AGENT !== 'off') startLoop();
