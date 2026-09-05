"use client";

export default function GlobalError({ unstable_retry }: { unstable_retry: () => void }) {
  return <html lang="en"><body><main>
    <h1>Junction Generator could not load</h1><p>Please try again in a moment.</p>
    <button onClick={unstable_retry}>Try again</button>
    <p><a href="mailto:james_gordon@junctiongenerator.net">Contact James</a></p>
  </main></body></html>;
}
