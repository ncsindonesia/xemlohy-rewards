# Xemlohy Smart Rewards: holding page

Temporary page for `rewards.neocropsolutions.com` until the full loyalty platform is live.

- `index.html`: home page (`https://rewards.neocropsolutions.com/`)
- `404.html`: identical page, shown for every scanned bottle link (`/b/CODE`) and carton link (`/c/CODE`)
- `CNAME`: tells GitHub Pages which custom domain to serve

The page reads the code from the link and checks only its format and check character.
It does NOT confirm the product is genuine: the list of genuine codes must never be uploaded here.

## Setup (summary)

1. Upload these files to the root of a public repository, e.g. `xemlohy-rewards`.
2. Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.
3. Settings → Pages → Custom domain: `rewards.neocropsolutions.com` → Save.
4. DNS (at the provider of neocropsolutions.com): CNAME `rewards` → `GITHUB-USERNAME.github.io`
   (no repository name, no wildcard records).
5. Verify the domain in Profile/Organization settings → Pages (TXT record GitHub provides).
6. After the DNS check passes (up to 24 hours), tick **Enforce HTTPS**.

When the real platform is ready, change only the DNS record for `rewards`. Printed QR codes keep working.

Before going live, confirm that +62 815 1773 3335 is on WhatsApp (used by the WhatsApp button).
