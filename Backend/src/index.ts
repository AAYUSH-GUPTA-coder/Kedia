import { FACTORY, HOST, PORT, SIMULATE_ONLY } from './config.ts';
import { startLoop } from './agent.ts';
import { startServer } from './server.ts';

if (/^0x0+$/.test(FACTORY)) throw new Error('ABI/addresses.json has no factory yet. Deploy with SmartContracts/script/Deploy.s.sol first.');
console.log(`Factory ${FACTORY}${SIMULATE_ONLY ? ' (SIMULATE_ONLY: no transactions will be sent)' : ''}`);
startServer(HOST, PORT);
if (process.env.AGENT !== 'off') startLoop();
