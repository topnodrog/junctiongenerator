import { Wallet, safeEqual } from "./wallet.js";
import { generateRecoveryPhrase, normalizeRecoveryPhrase } from "./recovery.js";

export interface RecoveryPrompts {
  show(message: string): void;
  secret(question: string): Promise<string>;
  acknowledge(question: string): Promise<string>;
  clear(): void;
}

/** No wallet is returned until the complete backup has been re-entered. */
export async function createVerifiedRecoveryWallet(io: RecoveryPrompts, chainId: string): Promise<Wallet> {
  io.show("This wallet has no password reset. Anyone with these 24 words can spend its funds. Write them down in order and store them offline. Do not photograph, email, or share them. Use a private terminal with recording disabled.");
  if (await io.acknowledge('Type READY when you can make a private backup: ') !== "READY") throw new Error("Wallet setup cancelled. Run setup again and type READY at the first prompt.");
  const phrase = generateRecoveryPhrase();
  io.show(phrase.split(" ").map((word, i) => `${i + 1}. ${word}`).join("\n"));
  await io.acknowledge("Press Enter after writing all 24 words down. The words will then be hidden: ");
  io.clear();
  while (true) {
    const input = await io.secret("Enter all 24 words from your backup, separated by spaces (input hidden): ");
    let confirmation = "";
    try { confirmation = normalizeRecoveryPhrase(input); } catch { /* Invalid or incomplete backup. */ }
    if (safeEqual(confirmation, phrase)) return Wallet.fromRecoveryPhrase(confirmation, chainId);
    if ((await io.acknowledge("The words did not match. Type RETRY to enter the same backup again, or press Enter to cancel: ")).trim().toUpperCase() !== "RETRY") {
      throw new Error("Recovery words do not match. No wallet was saved.");
    }
  }
}

export function verifyWalletRecovery(wallet: Wallet, phrase: string): void {
  const network = wallet.recoveryNetwork();
  if (!network) throw new Error("Legacy wallets need their encrypted keystore backup; a new phrase cannot recover their old keys");
  const restored = Wallet.fromRecoveryPhrase(phrase, network, wallet.labels().length);
  wallet.labels().forEach((label, index) => {
    if (!safeEqual(wallet.publicKey(label), restored.publicKey(`account-${index}`))) throw new Error("Recovery words do not match this wallet");
  });
}
