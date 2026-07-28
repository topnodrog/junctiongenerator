async function readStatus(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const timeoutMs = Number(process.env.JGC_COMPOSE_SMOKE_TIMEOUT_MS ?? 120_000);
  const endpoints = {
    producer: process.env.JGC_PRODUCER_STATUS ?? "http://127.0.0.1:7777/status",
    backchecker: process.env.JGC_BACKCHECKER_STATUS ?? "http://127.0.0.1:7778/status",
  };
  const deadline = Date.now() + timeoutMs;
  let lastError = "containers did not become ready";

  while (Date.now() < deadline) {
    try {
      const [producer, backchecker] = await Promise.all([
        readStatus(endpoints.producer),
        readStatus(endpoints.backchecker),
      ]);
      const sameNetwork = producer.network === "jgc-testnet-v3" && backchecker.network === producer.network;
      const connected = producer.peerCount >= 1 && backchecker.peerCount >= 1;
      const advanced = producer.height >= 1 && backchecker.height === producer.height;
      const produced = producer.producer?.producedBlocks >= 1 && producer.producer?.lastError === null;

      if (sameNetwork && connected && advanced && produced) {
        console.log(JSON.stringify({ producer, backchecker }, null, 2));
        console.log("[compose-smoke] two connected nodes produced and synchronized a block");
        return;
      }
      lastError = JSON.stringify({ sameNetwork, connected, advanced, produced, producer, backchecker });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`[compose-smoke] timed out: ${lastError}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
