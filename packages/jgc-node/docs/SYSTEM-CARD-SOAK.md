# System card and participant soak

This pilot is for volunteers who control their computers. It exercises a
signed resource agreement, local hashing and real **testnet** settlement.
The workload is synthetic. A signed card authorizes a local demonstration and
records the choice. Participants pay for their own electricity and connectivity.

## Preview on your computer

Use a reviewed commit supplied by the coordinator. From `packages/jgc-node`
with a supported Node.js version, run:

```text
npm ci
npm run soak:card
```

On Windows PowerShell you can use `npm.cmd`. Preview reads CPU availability
and system memory locally. It starts zero workers and makes no reservation.

| Checklist item | What you choose or agree to |
| --- | --- |
| CPU | An integer number of hashing workers, including zero. The pilot offers up to four and leaves at least one logical CPU outside its worker count. The OS schedules these threads. |
| RAM | Zero to the displayed MiB of touched buffer memory. The pilot offers up to 512 MiB, bounded by half the free memory above 1 GiB at enrollment. |
| GPU, storage and network contracts | Unavailable in this version. Normal node operation still uses runtime memory, local chain storage and network bandwidth. There is no whole-process or OS-level resource quota. |
| First full allocation | Choosing the displayed maximum of either enabled resource uses the **entire selected workload allocation** continuously. The first acceptance in this data directory fixes a deadline at most 24 hours away. A restart using that directory cannot extend the first window. You can stop earlier. |
| Shared use | Partial allocations use shared mode immediately. For a first full trial, type `SHARE` to add one shared day at the deadline, or press Enter to finish then. Later enrollments also use shared mode. Each minute the demo books 15 seconds at the agreed CPU/RAM amount. Workers exit between bookings. Real customer scheduling is future work. |
| Stop and expiry | Press Ctrl+C in the participant terminal. The node and workload stop together at cancellation or the signed final cutoff. Each phase lasts at most 24 hours. Continue with a new card, the same wallet and the same data directory to retain history. |
| Records | The node writes your signed terms, address, seed URLs, allocation, expiry and peer/chain observations locally. The network publishes your test address and slot receipts. You choose which local records to share. |

## Collect JGTC in your own recoverable wallet

1. Use a private terminal on the machine you control. After building via
   `soak:card`, create a **dedicated testnet** wallet and verify your offline
   backup. The examples use an ignored keystore name in the parent directory.
   Substitute a private location you control.

   ```text
   npm run wallet -- setup --keystore ../my-pilot.keystore.json
   npm run wallet -- verify-backup --keystore ../my-pilot.keystore.json
   npm run wallet -- list --keystore ../my-pilot.keystore.json
   ```

2. Write the 24 words in order. Keep the words, encrypted file and password
   private. Provide only the first public account address to the coordinator.
   With a new wallet its label is `account-0`. Legacy participant addresses
   still require their original identity backups.
3. Replace both example URLs with actual coordinator-supplied peers. Run:

   ```text
   npm run soak:participate -- --keystore ../my-pilot.keystore.json --seed wss://seed-a.example.net --seed wss://seed-b.example.org
   ```

4. Unlock the wallet through the hidden terminal prompt. Set each resource
   independently. Review the address, exact amounts, mode, seeds and UTC
   deadline before typing `ACCEPT`. Enter cancels at confirmation. The
   launcher uses the first wallet account in memory. It writes the signed
   card and observations under `data/card-soak`. The consent signature covers
   the displayed terms and settings. To verify its integrity later:

   ```text
   npm run soak:card -- --verify data/card-soak/card-REPLACE-ID.json
   ```

5. Open `http://127.0.0.1:7777/status`. Check the address matches your
   wallet, the role is participant, peers connect and height advances.
   Check `http://127.0.0.1:7777/balance?address=YOUR_PUBLIC_ADDRESS` for
   pending and mature JGTC. The generic balance fields in `/status` are
   placeholders. Epochs span 144 blocks. An accepted slot receipt adds
   equal weight, and settlement divides the epoch pool by recorded weight.
   Coinbase outputs mature after another 100 blocks. Staying connected
   without an accepted receipt earns no protocol weight.
6. After stopping the node, read the mature balance from its local block
   store. To rehearse recovery privately, restore to a **new** file and
   compare its address before using it.

   ```text
   npm run wallet -- restore --accounts 1 --keystore ../restored-pilot.keystore.json
   npm run wallet -- balance account-0 --keystore ../restored-pilot.keystore.json --datadir data/card-soak
   ```

## Coordinator's first multi-host run

1. Pin the commit and genesis, publish real WSS peer URLs and assign one
   designated producer. Use the [self-hosted kit](../deploy/selfhosted/README.md).
   The pilot identity is `jgtc-testnet-v2`, genesis
   `da5c0c28e076211e13e75f8cd28fe98f81080dafefc5ad803620961d16ee1d77`.
   Run the kit's TLS and restore checks. Verify blocks advance with signed
   receipts before inviting volunteers. The cloud development environment
   and a GitHub PAT do not provide a public seed or an independent operator.
2. Record the agreed UTC start/end, commit, genesis, participant IDs and
   test addresses. Use one entry per person per window, including the
   organizer on identical terms. Obtain individual opt-in. Make publishing
   names optional. Keep wallets, card files and detailed local logs private.
3. Run for at least 72 hours and three completed settlements at normal
   cadence. Each volunteer reviews the next card after their signed session ends.
   Arrange an independent observer on another host. Every five minutes,
   for each seed, use a different output and history path:

   ```text
   npm run collect-soak-evidence -- --url https://seed-a.example.net/explorer --output .tmp/seed-a-current.json --append .tmp/seed-a-history.jsonl
   ```

   Record collection failures with their UTC times. Compare the seed tips,
   genesis, settlement boundaries, receipt weights and supply. Each participant
   can compare their local five-minute `observations-*.jsonl` with the
   independent chain record. An open terminal or a single signed card does
   not demonstrate 24 hours online. Samples can miss a brief outage. Record
   unexplained gaps as unresolved; do not issue a credit on an assumption.
4. Exercise an operator-approved restart and one-seed outage. Preserve the
   histories, verify catch-up and mature balances, and reconcile each
   settlement before reporting a successful cohort. Record outstanding
   gaps and participant disputes alongside the report.

## Proposed launch allocation

The owner's proposal offers the cohort **one full day of era-0 issuance per
verified 24-hour window**. This draft uses aligned UTC days, one eligible
person counted once per day regardless of machines or resources. For example,
three eligible participants split 7,200 equally and receive a proposed 2,400
each. An empty day creates no allocation. The current chain independently
distributes its valueless JGTC according to receipt weight.

Before a value-bearing launch the proposal calls for a premine covering the
audited daily allocations, with eligible JGTC exchangeable one-for-one for
JGC. Auditors and governance must reconcile the off-chain daily shares with
actual JGTC holdings, define eligibility when coins move, establish a cutoff,
prevent duplicate claims and publish a supply-conserving genesis and redemption
procedure. A test balance or signed system card creates no current redemption
right. The proposal also directs proceeds remaining after all expenses to JGC
market purchases and burns. Market trading would determine price. Expense
approval, custody, execution and public burn accounting are still open.

For a planning estimate, create a private JSON file with `day` (YYYY-MM-DD)
and `addresses` (an array of independently reviewed eligible test addresses).
Run `npm run soak:estimate -- reviewed-day.json` after building. It splits the
whole pool in integer base units. Any remainder goes one unit at a time in
sorted address order. It prints a worksheet and performs no transfer. Store
one reviewed worksheet per UTC date, including the eligibility evidence.
Only an audited, approved launch could establish the final terms.

## Audit and reproduction

| Claim | How to check it |
| --- | --- |
| Consent, expiry, shared bookings and wallet binding | `npm test -- --runTestsByPath src/tests/system-card.test.ts`. Check the receipt with `soak:card -- --verify`. |
| Local settlement and recovery | After building, run `node scripts/rehearse-soak-settlement.mjs`. This isolated run creates a disposable wallet, settles an epoch, waits in block heights for maturity, derives the account again from its words and confirms a spend. |
| Public multi-host readiness | Requires real seed endpoints, volunteers, a back-checker, completed windows and reviewed evidence. Accelerated local mining cannot establish elapsed uptime. |
| Production economics, proofs and governance | See the [mainnet gates](../../../docs/mainnet/README.md) and [premine decision history](../../../docs/mainnet/PREMINE_FUNDING_DECISION.md). There is no funded redemption, buyback executor or value-bearing launch in this pilot. |
