"use client";

import { useState } from "react";

export default function CopyCommands({ commands }: { commands: string }) {
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(commands);
      setMessage("Commands copied.");
    } catch {
      setMessage("Select and copy the commands below.");
    }
  }

  return (
    <div>
      <button type="button" className="jg-button jg-button-secondary" onClick={copy}>Copy commands</button>
      <span role="status">{message}</span>
    </div>
  );
}
