// First-run orientation. Shown automatically the first time a visitor loads the visualizer
// (gated by the `opviz.intro.v1` localStorage flag in App.tsx) and re-openable anytime via the
// "?" button in the header. Orients a student to what the tool is, the basic interaction loop,
// and a suggested scenario order — the things a cold-start user otherwise has to guess.

export function IntroDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="introBackdrop" role="presentation" onClick={onClose}>
      <div
        className="introCard"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to the Open Payments Visualizer"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="introClose" aria-label="Close" onClick={onClose}>
          ✕
        </button>

        <h1 className="introTitle">
          Welcome to the Open Payments <span className="brandAccent">Visualizer</span>
        </h1>
        <p className="introLede">
          An interactive walkthrough of how a payment moves through Open Payments — wallet discovery,
          GNAP grants, quotes, interactive consent, and the final outgoing payment — shown as a live
          graph, a timeline, and plain-language narration.
        </p>

        <div className="introSection">
          <h2>How to use it</h2>
          <ol className="introSteps">
            <li>Pick a <strong>Scenario</strong> from the dropdown (top-left).</li>
            <li>Press <strong>Start</strong> and watch the flow play out. Use <strong>Speed</strong> to slow it down.</li>
            <li>When it pauses for approval, press <strong>Consent</strong> — the run finishes automatically.</li>
            <li>Click any <strong>step, node, or arrow</strong> at any time to pin an explanation of what it does.</li>
          </ol>
          <p className="introHint">
            <strong>Mocked</strong> mode needs no setup — it's the best place to start. The graph's symbols
            and colours are explained in the <strong>Legend</strong> (top-right of the Flow panel).
          </p>
        </div>

        <div className="introSection">
          <h2>Suggested path</h2>
          <p className="introHint">Each scenario adds one new idea — work through them in order:</p>
          <ol className="introPath">
            <li>
              <span className="introPathName">One Time P2P Payment</span>
              <span className="introPathDesc">the canonical end-to-end sequence</span>
            </li>
            <li>
              <span className="introPathName">Recurring Subscription</span>
              <span className="introPathDesc">a recurring grant; two institutions</span>
            </li>
            <li>
              <span className="introPathName">Split Payment</span>
              <span className="introPathDesc">one payment fanned out to two recipients</span>
            </li>
          </ol>
        </div>

        <div className="introFooter">
          <button type="button" className="btn primary" onClick={onClose}>
            Got it
          </button>
          <span className="introFooterHint">Reopen anytime with the “?” button in the header.</span>
        </div>
      </div>
    </div>
  )
}
