#!/usr/bin/env bash
# Deploys and funds a GuardedVault on a local anvil fork of HSK mainnet, for testing with fake money.
# Start the fork first, in its own terminal:  anvil --fork-url https://mainnet.hsk.xyz --port 8547
# This overwrites ABI/addresses.json with fork addresses; restore it with `git checkout ABI/addresses.json`.
set -euo pipefail
cd "$(dirname "$0")"

R=http://127.0.0.1:8547
# anvil's well-known dev accounts 0 and 1: public test keys, never use them on mainnet.
OWNER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
OWNER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
OPERATOR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
USDT=0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029
WHSK=0xB210D2120d57b758EE163cFfb43e73728c471Cf1

cast chain-id -r $R >/dev/null 2>&1 || { echo "No fork on $R. Start: anvil --fork-url https://mainnet.hsk.xyz --port 8547"; exit 1; }

OPERATOR=$OPERATOR forge script script/Deploy.s.sol --rpc-url $R --broadcast --private-key $OWNER_PK >/dev/null
VAULT=$(python3 -c "import json;print(json.load(open('../ABI/addresses.json'))['vault'])")

# Give the owner 100 fake USDT (OZ ERC20 balances live at slot 0) and wrap 300 HSK into WHSK.
cast rpc anvil_setStorageAt $USDT "$(cast index address $OWNER 0)" "$(cast to-uint256 100000000)" -r $R >/dev/null
cast send $WHSK 'deposit()' --value 300ether --private-key $OWNER_PK -r $R >/dev/null
for t in "$USDT 30000000" "$WHSK 300000000000000000000"; do
  set -- $t
  cast send $1 'approve(address,uint256)' $VAULT $2 --private-key $OWNER_PK -r $R >/dev/null
  cast send $VAULT 'deposit(address,uint256)' $1 $2 --private-key $OWNER_PK -r $R >/dev/null
done

echo "Vault $VAULT on the fork holds 30 USDT + 300 WHSK. Equity (8 decimals): $(cast call $VAULT 'equity()(uint256)' -r $R)"
