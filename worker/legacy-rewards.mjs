// Pure response builder for the retired Worker dispense preview. Keep it free
// of database and network operations so its read-only behavior is testable.
export function legacyDispensePreview(recipients) {
  const safeRecipients = Array.isArray(recipients) ? recipients : [];
  const totalAmount = safeRecipients.reduce((sum, row) => {
    const amount = Number(row?.[1]);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);

  return {
    success: true,
    dryRun: true,
    totalAmount,
    recipientCount: safeRecipients.length,
    recipients: safeRecipients,
    message: safeRecipients.length === 0
      ? "No pending claims. This legacy endpoint is read-only."
      : "Legacy preview only: no database rows changed and no on-chain transaction was submitted.",
  };
}
