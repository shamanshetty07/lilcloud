import { GitHubIcon } from "./SocialButtons.tsx";

export const REPO_URL = "https://github.com/shamanshetty07/lilcloud";

export function GitHubLink() {
  return (
    <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="lilcloud on GitHub" title="lilcloud on GitHub"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-fg/40 text-fg transition-colors hover:border-fg/70 hover:bg-raised">
      <GitHubIcon />
    </a>
  );
}
