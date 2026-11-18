import Image from "next/image";
import type { ReactNode } from "react";
import { label, Mark, Tag } from "./ui";

/** The static page that replaced the live dashboard once Kedia was shut down. */

const REPO = "https://github.com/AAYUSH-GUPTA-coder/Kedia";
const VIDEO = "https://youtu.be/J6QaVf1tYr8";
const REJECTION_TX = "https://testnet-explorer.hskchain.net/tx/0x0579fd0b6d262a6b82b172c9edf22deaa2725fb62e86dedd790dc8de0e55dbbb";

const PILLARS: [string, string][] = [
  ["Your vault", "Your money sat in a contract only your wallet owned. Only you could deposit, withdraw or pause."],
  ["Your rules, on-chain", "Max trade size, a daily stop-loss, allowed tokens and a price check. A trade that broke one was reverted, not filled."],
  ["Its own agent", "A dedicated agent wallet traded for you on HSKSwap. It could never withdraw, and you steered it in plain English."],
];

const STEPS: [string, string][] = [
  ["Read the market", "Every 30 seconds the agent read the HashKey Exchange order book, an HSKSwap quote for the exact trade size, and the on-chain oracle price."],
  ["Find a gap", "It bought when HSKSwap priced a token below the exchange and sold when above, only when the gap beat fees and price impact."],
  ["Ask the vault", "The agent wallet could call one function: executeSwap on its own vault. Trades the vault would refuse were simulated first and cost no gas."],
  ["Check after the fill", "The price band and stop-loss ran on the real fill, inside the same transaction. A bad fill was undone, not just discouraged."],
];

const RULES: [string, string, string][] = [
  ["Max trade size", "$10", "A runaway or mistaken order"],
  ["Daily loss cap", "5% of the day's start", "Losing more than you accepted in one day"],
  ["Allowed tokens", "USDT, WHSK, WETH", "Trading anything you did not approve"],
  ["Cooldown", "Off", "Rapid-fire trading, if you turned it on"],
  ["Oracle freshness", "26 hours", "Trading on a dead price feed"],
  ["Price band", "5%", "Bad fills from thin or manipulated pools"],
];

const DIFFERENT = [
  ["Rules were contract code, not prompt text.", "A prompt injection, a model mistake or a strategy bug could not exceed your max trade, trade a token you blocked, or pass your daily loss cap. The transaction reverted."],
  ["The agent never held your funds.", "Each vault had its own agent wallet holding only HSK for gas. It could not withdraw, change rules, or touch anyone else's vault."],
  ["Autonomy and control at the same time.", "You set the rules once and the agent traded around the clock. You changed them by chat and one signature, and the agent could not undo them."],
  ["The last two checks ran after the swap.", "A manipulated pool or a bad fill was undone inside the same transaction."],
  ["Every guardrail had a fork test against real pools.", "One test dumps a million WHSK into the live WHSK/USDT pool and shows the vault undoing the trade."],
];

const STACK: [string, string][] = [
  ["Chain", "HSK Chain, HSKSwap (Uniswap V3) router and quoter"],
  ["Prices", "Supra on-chain oracle, HashKey Exchange order book"],
  ["Contracts", "Solidity, Foundry, OpenZeppelin"],
  ["Agent", "Node 24 and viem, one agent wallet per vault"],
  ["Chat", "Claude Sonnet 5.5 with tool calls; the model never held a key"],
  ["Dashboard", "Next.js 16, React 19, wagmi, Tailwind CSS"],
];

const link = "text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-accent";

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="space-y-6 border-t border-line pt-12">
      <div>
        <span className={label}>{eyebrow}</span>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Shot({ src, alt, w, h, caption }: { src: string; alt: string; w: number; h: number; caption: ReactNode }) {
  return (
    <figure className="space-y-3">
      <Image src={src} alt={alt} width={w} height={h} sizes="(min-width: 1024px) 896px, 100vw" className="h-auto w-full rounded-xl border border-line" />
      <figcaption className="text-sm text-faint">{caption}</figcaption>
    </figure>
  );
}

function ButtonLink({ href, primary, children }: { href: string; primary?: boolean; children: ReactNode }) {
  const style = primary ? "border-transparent bg-fg text-canvas hover:bg-white" : "border-line-strong bg-raised text-fg hover:border-fg/25";
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${style}`}>
      {children}
    </a>
  );
}

export function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Mark />
            <span className="font-semibold tracking-tight">Kedia</span>
          </div>
          <Tag>Closed</Tag>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-12 px-4 py-10 sm:px-6 sm:py-14">
        <p role="status" className="rounded-xl border border-line-strong bg-raised px-5 py-4 text-sm text-muted">
          <strong className="font-semibold text-fg">Kedia is closed.</strong> The agent no longer trades and the dashboard is offline.
        </p>

        <section aria-labelledby="hero-title" className="space-y-6">
          <h1 id="hero-title" className="text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
            An AI trader that <span className="text-accent">can&apos;t break your rules.</span>
          </h1>
          <p className="max-w-2xl text-lg text-pretty text-muted">
            Kedia was an autonomous trading agent for HSKSwap on HSK Chain. Letting an AI trade usually means handing it your wallet key and hoping a prompt keeps it in line. Kedia kept your money in your own vault and let the agent trade it only inside limits the smart contract enforced on every trade.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={VIDEO} primary>Watch the demo (2:32)</ButtonLink>
            <ButtonLink href={REPO}>Source on GitHub</ButtonLink>
          </div>
          <Shot src="/landing/dashboard.png" alt="The Kedia dashboard: equity, stop-loss headroom, value over time, positions and the agent's reasoning per token" w={2560} h={1975}
            caption="The dashboard while Kedia ran on HSK Chain testnet with test funds." />
        </section>

        <Section eyebrow="The problem" title="Trading agents need your key, and a prompt is not a rule.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-5">
              <span className={label}>Problem</span>
              <p className="mt-2 text-muted">Trading bots and AI agents need your wallet key. A key can do anything, and &ldquo;stop at 5% loss&rdquo; in a prompt is a suggestion, not a rule.</p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-5">
              <span className={label}>Kedia&apos;s answer</span>
              <p className="mt-2 text-muted">A vault per user that held the funds and enforced trade size, daily stop-loss, token allowlist, price sanity and oracle freshness in Solidity. The agent&apos;s key could only call <code className="font-mono text-fg">executeSwap</code>.</p>
            </div>
          </div>
          <ol className="grid gap-3 sm:grid-cols-3">
            {PILLARS.map(([title, body], i) => (
              <li key={title} className="rounded-xl border border-line bg-panel p-5">
                <span className="font-mono text-sm text-accent tabular-nums">0{i + 1}</span>
                <h3 className="mt-2 font-medium">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section eyebrow="How it worked" title="Trade the gap between HSKSwap and the exchange.">
          <p className="max-w-2xl text-muted">
            The default strategy was mean-reversion on the gap between HSKSwap and the HashKey Exchange order book, with a 0.6% edge after fees and price impact. A momentum strategy, a fast and slow moving average of the exchange price, was the alternative.
          </p>
          <ol className="grid gap-3 sm:grid-cols-2">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-4 rounded-xl border border-line bg-panel p-5">
                <span className="font-mono text-sm text-accent tabular-nums">0{i + 1}</span>
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <Shot src="/landing/trade-checks.png" alt="The seven checks the vault ran on every executeSwap, and the revert each one raised" w={2320} h={1800}
            caption="The seven checks the vault ran on every trade, in order, and the revert each one raised." />
        </Section>

        <Section eyebrow="The guardrails" title="Six limits the vault enforced on-chain.">
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel">
                <tr className="border-b border-line">
                  <th scope="col" className={`${label} px-4 py-3 font-normal`}>Rule</th>
                  <th scope="col" className={`${label} px-4 py-3 font-normal`}>Default</th>
                  <th scope="col" className={`${label} hidden px-4 py-3 font-normal sm:table-cell`}>What it stopped</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map(([rule, def, stops]) => (
                  <tr key={rule} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 font-medium">{rule}<span className="mt-0.5 block text-xs font-normal text-faint sm:hidden">{stops}</span></td>
                    <td className="px-4 py-3 font-mono text-muted">{def}</td>
                    <td className="hidden px-4 py-3 text-muted sm:table-cell">{stops}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section eyebrow="Control" title="Steer it in plain English.">
          <div className="grid items-center gap-6 sm:grid-cols-2">
            <div className="space-y-4 text-muted">
              <p>
                You typed <span className="text-fg">&ldquo;halve my risk and stop trading WETH&rdquo;</span>. The chat model read your vault, proposed new rules, and showed a before and after table.
              </p>
              <p>One signature applied every change in a single transaction. The model never held a key, and nothing changed without your click or signature.</p>
            </div>
            <Shot src="/landing/chat-proposal.png" alt="A chat proposal in Kedia: a before and after table of vault rules with a Sign and apply button" w={1424} h={1820}
              caption="A rule change proposed in chat, waiting for the owner's signature." />
          </div>
        </Section>

        <Section eyebrow="Proof" title="A real trade the vault refused.">
          <Shot src="/landing/guardrail-rejection.png" alt="A failed executeSwap on the HSK testnet explorer, reverted by the vault with TradeTooLarge" w={2260} h={1600}
            caption={<>A chat request to buy $29.96 of WETH, reverted on-chain with <code className="font-mono text-muted">TradeTooLarge</code> because the vault&apos;s max trade was $10. <a href={REJECTION_TX} target="_blank" rel="noreferrer" className={link}>Open the transaction</a>.</>} />
        </Section>

        <Section eyebrow="Why it was different" title="Autonomy without handing over the keys.">
          <ul className="space-y-4">
            {DIFFERENT.map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <p className="text-muted"><span className="font-medium text-fg">{title}</span> {body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section eyebrow="Built with" title="The stack.">
          <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
            {STACK.map(([k, v]) => (
              <div key={k} className="bg-panel p-4">
                <dt className={label}>{k}</dt>
                <dd className="mt-1 text-sm text-muted">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-faint">
            Contract addresses, tests and setup steps are in the <a href={REPO} target="_blank" rel="noreferrer" className={link}>README on GitHub</a>.
          </p>
        </Section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-faint sm:px-6">
          <span>Built by Aayush Gupta</span>
          <nav aria-label="Links" className="flex flex-wrap gap-x-5 gap-y-2">
            <a href={REPO} target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">GitHub</a>
            <a href={VIDEO} target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">Demo video</a>
            <a href="https://twitter.com/Aayush_gupta_ji" target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">X</a>
            <a href="https://www.linkedin.com/in/aayushguptaji/" target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">LinkedIn</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
