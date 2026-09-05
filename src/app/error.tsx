"use client";

import Link from "next/link";

export default function PageError({ unstable_retry }: { unstable_retry: () => void }) {
  return <main className="jg-page jg-section-error" role="alert">
    <h1>This page could not load</h1><p>Please try again or return to the home page.</p>
    <button className="jg-button jg-button-primary" onClick={unstable_retry}>Try again</button>
    {" "}<Link href="/">Go home</Link>
  </main>;
}
