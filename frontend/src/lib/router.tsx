import { useEffect, useState, type AnchorHTMLAttributes } from "react";

export const navigate = (to: string) => {
  history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
};

export const usePath = () => {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return path;
};

export const Link = ({ href = "/", onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a
    href={href}
    onClick={e => {
      onClick?.(e);
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(href);
    }}
    {...rest}
  />
);
