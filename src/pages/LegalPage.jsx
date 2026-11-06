import { config } from '../config'
import { Link, useRouter } from '../router'
import { fmtMoney } from '../utils'
import '../legal.css'

// /terms, /privacy and /responsible-gambling: the site's legal pages (modelled on
// RekoJ's). One component, three documents; the path picks which. Everything here
// describes what the site really does (server/auth.js, server/kick/chat.js,
// server/features/*), so update the text when a feature changes how it handles data.

const UPDATED = '6 November 2026'
const CODE = config.referralCode.toUpperCase()
const CASINO = config.casino
const ext = { target: '_blank', rel: 'noopener noreferrer' }
const Discord = ({ children = 'Discord' }) => (
  <a href={config.discordUrl} {...ext}>
    {children}
  </a>
)

export default function LegalPage() {
  const { path } = useRouter()
  const doc = path === '/privacy' ? <Privacy /> : path === '/responsible-gambling' ? <Responsible /> : <Terms />
  return (
    <div className="titled-page legal-page">
      <article className="legal">{doc}</article>
    </div>
  )
}

function Head({ title, lead }) {
  return (
    <header className="legal-head">
      <nav className="legal-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>{title}</span>
      </nav>
      <h1>{title}</h1>
      <p className="legal-lead">{lead}</p>
      <p className="legal-date">Last updated {UPDATED}</p>
      <nav className="legal-tabs" aria-label="Legal pages">
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/responsible-gambling">Responsible gambling</Link>
      </nav>
    </header>
  )
}

function Contact() {
  return (
    <section>
      <h2>Getting in touch</h2>
      <p>
        The quickest way to reach us about anything on this page is a ticket in the <Discord />, or a message on{' '}
        <a href={config.kickUrl} {...ext}>
          Kick
        </a>
        .
      </p>
      <p>
        Anything about your {CASINO} account itself, such as deposits, withdrawals, verification or self-exclusion, has to go to {CASINO}’s
        support team, because TEGENS has no access to it.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------- terms

function Terms() {
  const unit = fmtMoney(config.raffle.ticketUnit)
  return (
    <>
      <Head title="Terms of Service" lead="The rules for taking part in the TEGENS leaderboard, raffles, giveaways and stream events. By using this site, you agree to them." />

      <section>
        <h2>What this site is</h2>
        <p>
          TEGENS is a community site run by a streamer for people who play at {CASINO} under the code <b>{CODE}</b>. It is not a casino. It takes no
          deposits, holds no funds, accepts no bets and runs no games of chance for money. The leaderboard and rewards are built on an affiliate
          arrangement with {CASINO}. We are not owned, operated or endorsed by {CASINO}, and nothing on this site is an offer from them.
        </p>
        <p>
          Your casino account, your balance and your withdrawals are entirely between you and {CASINO}, under its own terms. We can’t see, change,
          credit or recover any of it.
        </p>
      </section>

      <section>
        <h2>Who can take part</h2>
        <ul>
          <li>
            You must be at least 18, or the legal gambling age where you live if that is higher. You must also be allowed to hold an account at{' '}
            {CASINO} under its own rules and the law where you are.
          </li>
          <li>
            For the leaderboard, milestones and wager raffle, your {CASINO} account must be registered under the code <b>{CODE}</b>. Accounts
            opened under another code, or with no code, don’t count.
          </li>
          <li>If you have self-excluded from gambling anywhere, or you use a blocking tool, please do not take part. No prize is worth breaking that for.</li>
          <li>Staff, and anyone helping run the site or the stream, are excluded from the leaderboard and its prizes.</li>
          <li>One person, one account. Entering with several Kick or {CASINO} accounts can get every one of them removed.</li>
        </ul>
      </section>

      <section>
        <h2>The monthly leaderboard</h2>
        <p>
          The leaderboard runs for one calendar month, in UTC, and the countdown at the top of the site shows when the current month closes. Players
          are ranked by the total they wagered under the code during the month. The top {config.prizes.length} share a{' '}
          {fmtMoney(config.prizePool)} prize pool, split as shown on the leaderboard page.
        </p>
        <p>
          Standings come from {CASINO}’s affiliate reporting, which we read and display. We don’t calculate the figures and can’t adjust them. They
          can take a little while to update, so what you see may lag behind your own account. If this site and {CASINO}’s reporting disagree,{' '}
          {CASINO}’s figures decide the result. A display error on this site does not create a prize.
        </p>
      </section>

      <section>
        <h2>Milestones</h2>
        <p>
          Milestone rewards are one-off rewards for your total wager under the code since the date shown on the Milestones page. Each tier can be
          claimed once, by opening a ticket in the <Discord /> once you’ve reached it. Linking your {CASINO} username on your profile lets the site
          show your tier; it doesn’t claim anything on its own.
        </p>
      </section>

      <section>
        <h2>Raffles</h2>
        <ul>
          <li>
            <b>Wager raffle.</b> Every {unit} wagered under the code during the raffle’s month is one ticket. Tickets are counted from {CASINO}’s
            affiliate reporting when the raffle locks.
          </li>
          <li>
            <b>Watch-time raffle.</b> Tickets come from time spent active in the stream’s Kick chat while the stream is live, counted in short
            windows: chatting in a window counts that whole window. The rate is shown on the raffle.
          </li>
          <li>
            Draws are provably fair: a fingerprint of the secret seed is published when the raffle locks, and the seed is revealed after the draw,
            so anyone can check every result on the raffles page. Each raffle shows how many draws it has and the most one person can win.
          </li>
        </ul>
      </section>

      <section>
        <h2>Giveaways, Guess the Balance and VIP calls</h2>
        <ul>
          <li>
            <b>Chat giveaways</b> are entered by typing the keyword shown on stream in Kick chat while entries are open. One entry per Kick account;
            chat bots can’t enter. Some giveaways are for VIPs only. Winners are drawn at random on stream and listed on the Giveaways page.
          </li>
          <li>
            <b>Guess the Balance</b> takes one guess per Kick account, with <code>!guess</code> in chat or on the site. You can change it until
            guesses lock. The closest guess to the final balance wins; on a tie, the earlier guess wins.
          </li>
          <li>
            <b>Slot calls</b> (<code>!call</code>) are open to chat, or at times only to people on the VIP list, which the streamer manages. Calling a slot doesn’t oblige
            anyone to play it, and what a call pays doesn’t become your money.
          </li>
          <li>
            If a winner doesn’t respond when called on stream, or doesn’t claim within the time announced, the prize can be re-drawn to someone
            else.
          </li>
        </ul>
      </section>

      <section>
        <h2>Prizes</h2>
        <ul>
          <li>Prizes are paid by TEGENS, not by {CASINO}. They don’t come from your casino balance and are not a casino promotion.</li>
          <li>
            To be paid, open a ticket in the <Discord /> with the username shown on the result. If a winner can’t be reached within 30 days of the
            result, the prize may be forfeited.
          </li>
          <li>
            A prize can be withheld or reversed if an entry broke these terms, if {CASINO} reverses or voids the wagering behind it, or if the play
            was not genuine. That includes bonus abuse, chargebacks, self-wagering, running multiple accounts, collusion, and figures inflated by a
            bug.
          </li>
        </ul>
      </section>

      <section>
        <h2>Fair use</h2>
        <p>
          Do not scrape, overload or interfere with this site or its chat commands, and do not abuse the people who run it or the chat. Doing any of
          that can get you removed from the leaderboard, raffles and giveaways.
        </p>
      </section>

      <section>
        <h2>Promotions can change</h2>
        <p>
          Prize pools, the number of paid places, raffles and events can change or end. The current version of the page is the one that applies.
          If a change affects a month already running, we won’t reduce what was on offer part-way through.
        </p>
      </section>

      <section>
        <h2>No guarantees about the site itself</h2>
        <p>
          The site is provided as it is. Standings can be delayed or wrong while a feed is down, chat commands can be missed if Kick’s chat
          connection drops, and pages can be unavailable. We are not liable for losses that result from that. In no case are we liable for money
          lost gambling at {CASINO} or anywhere else; that risk is entirely yours.
        </p>
      </section>

      <section>
        <h2>Responsible gambling</h2>
        <p>
          Gambling costs money and carries real financial risk. Nothing on this site suggests otherwise, and no leaderboard place is worth chasing
          with money you need. If gambling has stopped being entertainment, stop, and see our{' '}
          <Link to="/responsible-gambling">responsible gambling</Link> page for tools and free help.
        </p>
      </section>

      <section>
        <h2>Changes to these terms</h2>
        <p>We may update these terms. The date at the top shows when they last changed. If you keep using the site after a change, the updated version applies.</p>
      </section>

      <Contact />
    </>
  )
}

// ---------------------------------------------------------------- privacy

function Privacy() {
  return (
    <>
      <Head title="Privacy Policy" lead="What this site handles about you, why, who else is involved, and how to have it removed." />

      <section>
        <h2>The short version</h2>
        <p>
          You can browse the leaderboard, raffles and every other page without telling us anything. If you sign in with Kick (or Discord), we keep
          the basic profile that sign-in gives us. If you link your {CASINO} username, take part in chat commands or win something, we keep what
          that needs. We sell nothing to anybody and run no advertising. Analytics only runs if you say yes to it in the cookie banner.
        </p>
      </section>

      <section>
        <h2>If you just browse</h2>
        <ul>
          <li>
            <b>Your rank tracker.</b> If you type your {CASINO} username into “Track your rank”, your browser saves it in its local storage (one entry
            named <code>tegens.player</code>) so it’s there next time. It stays on your device; the site uses it to look up your wager.
          </li>
          <li>
            <b>Technical data.</b> Like any website, our server sees the IP address and browser details of each request. That’s used to deliver the
            pages, prevent abuse and keep the site running. It isn’t built into a profile of you.
          </li>
          <li>
            <b>Fonts.</b> Pages load the Rubik typeface from Google Fonts, so your browser requests it from Google’s servers, and Google receives
            your IP address and browser details.
          </li>
          <li>
            <b>Images and video from other services.</b> Slot artwork loads from imgix (an image service our slot list uses), video thumbnails
            from YouTube, the stream player from Kick, and profile pictures from Kick and Discord. Your browser requests these from their
            servers, which receive your IP address and browser details.
          </li>
          <li>
            <b>Analytics, only if you agree.</b> If analytics is switched on for the site, a banner asks first. Only if you choose “Allow
            analytics” does your browser load Google Analytics, which sets cookies and sends Google the pages you visit, your browser and device
            details and an approximate location from your IP address, so we can count visits. Choose “No thanks” and nothing is loaded. You can
            change your mind at any time with “Cookie settings” at the bottom of every page.
          </li>
        </ul>
      </section>

      <section>
        <h2>If you sign in</h2>
        <ul>
          <li>
            <b>Kick.</b> Signing in sends you to Kick, which asks whether to share your basic profile with TEGENS (the <code>user:read</code>{' '}
            permission). We keep your Kick user ID, username and profile picture, and when you first and last signed in. We never see your Kick
            password or email address.
          </li>
          <li>
            <b>Discord.</b> If you link Discord, Discord shares your basic profile (the <code>identify</code> permission): your user ID, username,
            display name and avatar. We don’t ask for your email address or your servers.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your {CASINO} username</h2>
        <p>
          When you link your {CASINO} username on your profile, we check it appears under the code <b>{CODE}</b> and keep it on your account. To
          show your tier, raffle tickets and leaderboard place, the site reads from {CASINO}’s affiliate reporting how much that username wagered
          under the code. We read figures from {CASINO}; we don’t send them anything about you.
        </p>
      </section>

      <section>
        <h2>Kick chat</h2>
        <p>
          Giveaways, Guess the Balance, slot calls and the watch-time raffle run in the stream’s public Kick chat, so the site reads that chat
          while it runs. It doesn’t store chat messages. It keeps only what each feature needs:
        </p>
        <ul>
          <li>a giveaway entry: your Kick username, user ID and when you entered;</li>
          <li>a guess: your username and the amount;</li>
          <li>a VIP slot call: your username, the slot and, once played, what it paid;</li>
          <li>
            for the watch-time raffle: which minutes you were active in chat while the stream was live, and the last time you chatted (kept for 60
            days).
          </li>
        </ul>
      </section>

      <section>
        <h2>Claims, orders, wins and messages you send</h2>
        <ul>
          <li>
            <b>Claims.</b> When you claim a milestone or a challenge bounty, we keep the claim with your Kick and {CASINO} usernames, the bet link
            or ID you give as proof, your note and what the team decided.
          </li>
          <li>
            <b>Store orders.</b> An order keeps the item, its cost, your usernames, any note you add and its state. Watch-store orders spend
            your loyalty points held by BotRix, the stream’s points service: the site sends BotRix your Kick username to read and take the
            points.
          </li>
          <li>
            <b>Biggest wins.</b> A win you submit keeps the slot, bet, multiplier, payout, the bet link, your note and your usernames. Once the
            team approves it, the Biggest Wins page shows your Kick username, the slot, the bet, multiplier and payout publicly, with a link to
            the bet if it’s a {CASINO} link.
          </li>
          <li>
            <b>The contact form.</b> Your name (if you give one), how to reply to you, the topic and your message are sent to the team’s
            private Discord channel. The site doesn’t keep a copy. The site’s server briefly remembers your IP address (for up to a day, in
            memory only) to stop the form being flooded.
          </li>
          <li>
            <b>Team alerts.</b> So nothing waits unseen, each new claim, {CASINO} link request, store order and submitted win is also posted
            to the team’s private Discord channel, with the usernames, the request, and any proof link or note you gave.
          </li>
        </ul>
      </section>

      <section>
        <h2>What is shown publicly</h2>
        <ul>
          <li>
            <b>The leaderboard</b> shows players’ usernames shortened and partly hidden (for example “Tege***”), amounts wagered and prizes. These
            come from {CASINO}’s affiliate reporting and appear whether or not a player has ever visited this site.
          </li>
          <li>
            <b>Raffle</b> entries are shown with names partly hidden; winners are shown on the raffles page and on stream.
          </li>
          <li>
            <b>Giveaway, Guess the Balance and VIP call results</b> show the winner’s or caller’s Kick username, on the site and on stream, because
            they happen in public chat.
          </li>
        </ul>
      </section>

      <section>
        <h2>Cookies</h2>
        <ul>
          <li>
            <code>tg_session</code> keeps you signed in. It’s signed so it can’t be forged, isn’t readable by page scripts, and lasts 30 days or
            until you sign out.
          </li>
          <li>
            <code>tg_oauth</code> exists only for the few minutes it takes to sign in with Kick or Discord, to protect the sign-in against forgery.
            It’s deleted when sign-in finishes.
          </li>
        </ul>
        <p>Both are needed for signing in to work. The site sets no advertising or social tracking cookies.</p>
        <p>
          If analytics is switched on and you choose “Allow analytics”, Google Analytics sets its own cookies (named <code>_ga</code> and{' '}
          <code>_ga_</code> followed by an ID), which last up to two years. Your choice itself is saved in your browser’s local storage as{' '}
          <code>tegens.consent</code>. Choosing “No thanks” later deletes the analytics cookies.
        </p>
      </section>

      <section>
        <h2>Who else is involved</h2>
        <ul>
          <li>
            <b>Kick</b> handles signing in and the stream’s chat, under its own privacy policy. The TEGENS chat bot posts announcements in chat.
          </li>
          <li>
            <b>Discord</b> handles Discord sign-in and the support tickets in our server.
          </li>
          <li>
            <b>{CASINO}</b> provides the affiliate figures the leaderboard, milestones and raffles are built from.
          </li>
          <li>
            <b>BotRix</b> holds the stream’s loyalty points that the watch store spends.
          </li>
          <li>
            <b>Discord</b> also carries the team’s private alerts and contact-form messages (see above).
          </li>
          <li>
            <b>Google</b> serves the fonts, and Google Analytics only if you allowed it.
          </li>
          <li>
            <b>imgix, YouTube, Kick and Discord</b> serve images and video shown on some pages.
          </li>
          <li>
            <b>Our own server</b> hosts the site and stores accounts, links, entries and results.
          </li>
        </ul>
        <p>
          Nobody else receives anything, and none of it is sold, rented or used for advertising. Links to Kick, Discord and {CASINO} take you to
          their sites, under their privacy policies.
        </p>
      </section>

      <section>
        <h2>How long it is kept</h2>
        <ul>
          <li>Your account and linked usernames are kept while the site runs, until you ask us to delete them.</li>
          <li>Giveaway, raffle and guess results are kept so they can be checked later. Entries for a giveaway are cleared when it ends; its winners stay on the record.</li>
          <li>Chat activity for the watch-time raffle is kept for 60 days.</li>
          <li>Server logs are kept only as long as needed to run and protect the site.</li>
        </ul>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li>
            <b>Sign out</b> at any time from the account menu or your profile; this deletes the session cookie.
          </li>
          <li>
            <b>See or delete your data.</b> Open a ticket in the <Discord /> and we’ll tell you what we hold about you, or delete it. Prizes we still
            owe you are settled first.
          </li>
          <li>
            <b>Your casino account is separate.</b> Anything held by {CASINO} is theirs to manage, under their own policies.
          </li>
        </ul>
      </section>

      <section>
        <h2>Under 18s</h2>
        <p>
          This site is for adults and isn’t directed at anyone under 18, or under the legal gambling age where they live if that is higher. Please
          don’t sign in, link an account or take part if that’s you.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>If what the site handles changes, this page changes with it, and the date at the top is updated.</p>
      </section>

      <Contact />
    </>
  )
}

// ---------------------------------------------------------------- responsible gambling

function Responsible() {
  return (
    <>
      <Head title="Responsible Gambling" lead="Gambling should be entertainment you can afford. Here’s how to keep it that way, and where to get help if it isn’t." />

      <section>
        <h2>18+ only</h2>
        <p>
          Everything on this site is for adults: 18 or older, or the legal gambling age where you live if that is higher. If you’re under age,
          please leave the site.
        </p>
      </section>

      <section>
        <h2>Keep it fun</h2>
        <ul>
          <li>Only gamble with money you can afford to lose. Never with money for rent, bills or food.</li>
          <li>Decide your limit before you start, and stop when you reach it, win or lose.</li>
          <li>Don’t chase losses. The next spin doesn’t know what the last one did.</li>
          <li>A leaderboard place, raffle ticket or milestone is never a reason to wager more than you planned.</li>
          <li>Take breaks, and don’t gamble when you’re upset, stressed or have been drinking.</li>
        </ul>
      </section>

      <section>
        <h2>Warning signs</h2>
        <p>It may be time to stop if you:</p>
        <ul>
          <li>spend more money or time than you meant to, or hide how much from people close to you;</li>
          <li>borrow money, or sell things, to gamble or to cover losses;</li>
          <li>feel anxious, guilty or irritable about gambling, or when you try to cut down;</li>
          <li>gamble to win back what you’ve lost, or to escape problems.</li>
        </ul>
      </section>

      <section>
        <h2>Tools at {CASINO}</h2>
        <p>
          {CASINO} offers deposit limits, cool-off periods and self-exclusion on your account. Set them up in your account settings, or ask{' '}
          {CASINO}’s support team. TEGENS can’t set them for you, because we have no access to your casino account.
        </p>
        <p>
          If you self-exclude, please stop taking part here too. Open a ticket in the <Discord /> and we’ll delete your account on this site.
        </p>
      </section>

      <section>
        <h2>Free, confidential help</h2>
        <ul className="legal-help">
          <li>
            <a href="https://www.begambleaware.org" {...ext}>
              BeGambleAware
            </a>
            <span>Advice, tools and a free 24/7 helpline (UK).</span>
          </li>
          <li>
            <a href="https://www.gamblingtherapy.org" {...ext}>
              Gambling Therapy
            </a>
            <span>Free support worldwide, by chat and forums, in many languages.</span>
          </li>
          <li>
            <a href="https://www.gamcare.org.uk" {...ext}>
              GamCare
            </a>
            <span>The National Gambling Helpline and counselling (UK).</span>
          </li>
          <li>
            <a href="https://www.ncpgambling.org" {...ext}>
              National Council on Problem Gambling
            </a>
            <span>1-800-GAMBLER, call or text, any time (US).</span>
          </li>
          <li>
            <a href="https://www.gamblersanonymous.org" {...ext}>
              Gamblers Anonymous
            </a>
            <span>Meetings and peer support worldwide.</span>
          </li>
        </ul>
      </section>

      <Contact />
    </>
  )
}
