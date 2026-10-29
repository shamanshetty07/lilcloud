import type { ReactNode } from "react";
import { Link } from "../lib/router.tsx";
import { LiquidMetalLink } from "../components/LiquidMetal.tsx";
import { useAuth } from "../lib/auth.tsx";
import { Logo } from "../components/Logo.tsx";
import { GitHubLink } from "../components/GitHubLink.tsx";

const BLOCKED = [
  "exe", "msi", "bat", "cmd", "com", "scr", "pif", "dll", "sys", "vbs", "vbe", "wsf", "ps1", "psm1",
  "sh", "bash", "zsh", "jar", "apk", "app", "dmg", "iso", "reg", "lnk", "cpl", "hta",
  "php", "phtml", "phar", "jsp", "asp", "aspx", "cgi", "pl", "py", "rb",
];

const toc = [
  ["start", "Getting started"],
  ["account", "Your account"],
  ["upload", "Uploading"],
  ["manage", "Finding your things"],
  ["download", "Downloading"],
  ["delete", "Deleting"],
  ["limits", "Limits & what you can store"],
  ["plans", "Storage plans"],
  ["privacy", "Privacy & security"],
  ["troubleshooting", "Troubleshooting"],
  ["faq", "FAQ"],
];

const H = ({ id, children }: { id: string; children: ReactNode }) => (
  <h2 id={id} className="scroll-mt-20 pt-12 text-2xl font-bold tracking-[-0.04em]">{children}</h2>
);
const P = ({ children }: { children: ReactNode }) => <p className="mt-3 leading-relaxed text-muted">{children}</p>;
const Li = ({ children }: { children: ReactNode }) => <li className="leading-relaxed text-muted">{children}</li>;
const Ul = ({ children }: { children: ReactNode }) => <ul className="mt-3 list-disc space-y-1.5 pl-5 marker:text-line-strong">{children}</ul>;
const Ol = ({ children }: { children: ReactNode }) => <ol className="mt-3 list-decimal space-y-1.5 pl-5 marker:font-mono marker:text-muted">{children}</ol>;
const B = ({ children }: { children: ReactNode }) => <strong className="font-medium text-fg">{children}</strong>;
const Note = ({ children }: { children: ReactNode }) => (
  <p className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">{children}</p>
);
const Table = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => (
  <div className="mt-4 overflow-x-auto rounded-xl border border-line">
    <table className="w-full text-left text-sm">
      <thead className="border-b border-line bg-surface"><tr>{head.map(h => <th key={h} className="label px-4 py-2.5 font-normal">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line last:border-0">{r.map((c, j) => <td key={j} className="px-4 py-2.5 align-top text-muted first:text-fg">{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

export default function Docs() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/"><Logo /></Link>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-muted sm:block">documentation</span>
            <GitHubLink />
            <Link href={user ? "/app" : "/signin"} className="btn btn-primary">{user ? "Open my storage →" : "Sign in →"}</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-12 px-4 pb-24">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 py-10 lg:block">
          <p className="label mb-3">on this page</p>
          <nav className="space-y-2 text-sm">
            {toc.map(([id, t]) => <a key={id} href={`#${id}`} className="block text-muted hover:text-fg">{t}</a>)}
          </nav>
        </aside>

        <main className="min-w-0 max-w-2xl flex-1 pt-10">
          <p className="label">documentation</p>
          <h1 className="mt-2 text-4xl font-bold tracking-[-0.05em] sm:text-5xl">Using lilcloud</h1>
          <P>Everything you need to know to store, find, download and delete everything you keep in lilcloud. It takes about two minutes to read.</P>

          <H id="start">Getting started</H>
          <Ol>
            <Li><B>Create an account</B> from the Sign up page.</Li>
            <Li>You land on your <B>Storage</B> page, which is empty at first.</Li>
            <Li><B>Drag anything</B> onto the dashed box, or click it to browse.</Li>
            <Li>It appears in your list as soon as the upload finishes.</Li>
          </Ol>

          <H id="account">Your account</H>
          <h3 className="mt-5 font-medium">Signing up</h3>
          <Table head={["Field", "Requirements"]} rows={[
            ["Username", "3 to 30 characters. Letters, numbers, and the symbols _ . - only."],
            ["Email", "A valid email address. Each email can only be used for one account."],
            ["Password", "8 to 72 characters."],
          ]} />
          <h3 className="mt-6 font-medium">Continue with Google or GitHub</h3>
          <P>Prefer not to create a password? Choose <B>Continue with Google</B> or <B>Continue with GitHub</B> on the Sign in or Sign up page. We only receive your name and verified email address, and we never see your Google or GitHub password. If an account with that email already exists, you'll be signed in to it. Your provider must have a <B>verified</B> email on file.</P>
          <h3 className="mt-6 font-medium">Signing in and out</h3>
          <P>Sign in with your email and password, or with Google or GitHub. You stay signed in for <B>7 days</B> on that browser, then you'll be asked to sign in again. Use <B>Sign out</B> in the top right to end your session sooner, which is a good idea on shared computers.</P>
          <Note>There is currently no password reset, so keep your password somewhere safe.</Note>

          <H id="upload">Uploading</H>
          <Ul>
            <Li><B>Drag and drop</B> photos, documents, videos or anything else onto the upload box, or click it and pick items from your device.</Li>
            <Li>Each upload shows a <B>live progress bar</B>. When it reaches 100%, it joins your list.</Li>
            <Li>You can upload <B>several items at once</B>. They are sent one after another.</Li>
            <Li>If an upload fails, the reason appears next to it. Click it to dismiss, then try again.</Li>
          </Ul>
          <Note>Keep the page open until the progress bar finishes. Closing the tab or losing your connection cancels that upload, and nothing partial is saved.</Note>
          <h3 className="mt-6 font-medium">Names</h3>
          <P>Names are cleaned up for safety. Folder paths are removed, characters like <code className="font-mono text-fg">{'< > : " | ? *'}</code> become underscores, leading dots are dropped, and names longer than 200 characters are shortened (keeping the extension). Uploading the same name twice creates two separate files.</P>

          <H id="manage">Finding your things</H>
          <P>Your Storage page lists everything you've stored with its <B>name, type, size and upload time</B>, newest first. The counter at the top shows how many items you have and their total size.</P>
          <Ul>
            <Li><B>Search</B> filters the list by name as you type.</Li>
            <Li><B>Refresh</B> reloads the list, handy if you use lilcloud on two devices.</Li>
          </Ul>

          <H id="download">Downloading</H>
          <P>Click <B>download</B> on an item's row. It's saved to your device exactly as you uploaded it, with its original name.</P>

          <H id="delete">Deleting</H>
          <P>Choose <B>trash</B> on a file or folder to move it to Trash. Folders bring everything inside them along. Open the <B>Trash</B> tab to restore items or delete them permanently. Permanently deleted items cannot be recovered.</P>

          <H id="limits">Limits &amp; what you can store</H>
          <Table head={["Limit", "Value"]} rows={[
            ["Free storage", "1 GB per account"],
            ["Maximum size", "25 MB per item"],
            ["Uploads per minute", "20"],
            ["Sign-in / sign-up attempts", "20 per 15 minutes"],
            ["Session length", "7 days"],
          ]} />
          <h3 className="mt-6 font-medium">Files that can't be uploaded</h3>
          <P>To keep everyone safe, programs and scripts are blocked. An upload is rejected if any part of its name ends in one of these extensions, even if it's hidden in the middle, like <code className="font-mono text-fg">invoice.pdf.exe</code>:</P>
          <p className="mt-3 flex flex-wrap gap-1.5">
            {BLOCKED.map(e => <code key={e} className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-xs text-muted">.{e}</code>)}
          </p>
          <P>Need to store one of these? Put it in a <code className="font-mono text-fg">.zip</code> archive first. Documents, images, audio, video, PDFs, spreadsheets and archives are all fine.</P>

          <H id="plans">Storage plans</H>
          <P>Every account includes <B>1 GB of free storage</B>. Your usage is shown on your Storage page. Items in Trash still use storage until you delete them permanently.</P>
          <Table head={["Plan", "Storage", "Price", "Status"]} rows={[
            ["Free", "1 GB", "$0", "Available"],
            ["Plus", "50 GB", "$5 per year", "Coming soon"],
            ["Pro", "100 GB", "$15 per year", "Coming soon"],
          ]} />
          <P>Paid plans aren't open yet. You can <Link href="/pricing" className="text-fg underline underline-offset-4">join the waitlist</Link> and we'll email you once they launch. Nothing is charged until you choose to upgrade.</P>

          <H id="privacy">Privacy &amp; security</H>
          <Ul>
            <Li>Everything you store is <B>private to your account</B>. Other users can't see, list or download them, even if they somehow had its ID.</Li>
            <Li>Passwords are stored securely hashed, never in plain text.</Li>
            <Li>There are no public links. Files can only be downloaded while signed in.</Li>
            <Li>Anything unusual, like repeated failed sign-ins, is rate limited automatically.</Li>
          </Ul>
          <Note>lilcloud is an early prototype. Don't rely on it as your only copy of important files, and avoid storing highly sensitive data like government IDs or financial records.</Note>

          <H id="troubleshooting">Troubleshooting</H>
          <Table head={["You see", "What it means / what to do"]} rows={[
            ["Can't reach lilcloud right now", "Your connection dropped or the service is briefly unavailable. Check your internet, wait a minute and try again."],
            ["Larger than 25 MB / File exceeds 25MB limit", "Compress it, or split it into smaller parts."],
            ["This file type is not allowed", "See the blocked list above. Zip it first."],
            ["Storage is full", "You've used all 1 GB. Delete items you no longer need, or join the waitlist for a larger plan."],
            ["Too many uploads, slow down", "You hit 20 uploads in a minute. Wait a minute and continue."],
            ["Too many attempts, try again later", "Too many sign-in attempts. Wait about 15 minutes."],
            ["Sign-in was cancelled / expired", "You closed the Google or GitHub window, or took more than 10 minutes. Just try again."],
            ["Invalid email or password", "Check for typos. Passwords are case sensitive."],
            ["User already exists", "That username or email is taken. Try signing in instead."],
            ["Redirected to Sign in", "Your 7-day session ended. Sign in again, everything is still there."],
            ["That item no longer exists", "It was deleted, possibly from another device. Hit Refresh."],
            ["Storage is unavailable", "A temporary problem on our side. Everything is safe, try again shortly."],
          ]} />

          <H id="faq">FAQ</H>
          <h3 className="mt-5 font-medium">How much storage do I get?</h3>
          <P>1 GB free, with a 25 MB limit per item. Larger plans (50 GB and 100 GB) are coming soon.</P>
          <h3 className="mt-5 font-medium">Can I make folders or share something?</h3>
          <P>Not yet. Everything lives in a single list, and sharing isn't available.</P>
          <h3 className="mt-5 font-medium">Can I preview things in the browser?</h3>
          <P>Not yet. Download it to open it.</P>
          <h3 className="mt-5 font-medium">Will my stuff ever expire?</h3>
          <P>No. Items stay in your storage or Trash until you delete them permanently.</P>
          <h3 className="mt-5 font-medium">Can I rename something?</h3>
          <P>Not yet. Upload it again under the new name and delete the old one.</P>

          <div className="mt-16 rounded-xl border border-line bg-surface p-8 text-center">
            <p className="text-lg font-semibold tracking-tight">Ready to go?</p>
            <LiquidMetalLink href={user ? "/app" : "/signup"} className="mt-4">{user ? "Open your storage →" : "Create an account →"}</LiquidMetalLink>
          </div>
        </main>
      </div>
    </div>
  );
}
