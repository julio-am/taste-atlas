# Connect gettastemate.com to Cloudflare Pages

Keep the domain registered at Squarespace. To use the bare `gettastemate.com` domain with Cloudflare Pages, manage its DNS in the same Cloudflare account as the Pages project. This requires changing nameservers at Squarespace; it does not transfer domain registration or require a Squarespace website subscription.

The earlier instructions for `162.159.143.30`, `172.66.3.26`, and `custom-domains.chatgpt.site` applied to the ChatGPT Sites preview. Do not use those values for this Cloudflare Pages deployment. The new hostname and nameservers come from the owner's Cloudflare account, not from this document.

## 1. Deploy the website first

Follow [README.md](README.md#deploy-to-cloudflare-pages), confirm the actual `*.pages.dev` URL works, and keep that URL for the custom-domain setup. `gettastemate.pages.dev` is only a possible hostname; use the exact value Cloudflare assigns.

## 2. Move DNS management to Cloudflare

1. Add `gettastemate.com` as a domain in the same Cloudflare account and choose its Free plan.
2. Review the imported DNS records against Squarespace. Cloudflare's scan may miss records; preserve any existing email records (MX, SPF, DKIM, DMARC), unrelated subdomains, and verification records.
3. If DNSSEC is enabled at Squarespace, disable it before replacing nameservers, as directed by Cloudflare's migration flow. Re-enable DNSSEC using Cloudflare's instructions after activation.
4. Copy the exact nameservers assigned to this domain by Cloudflare.
5. In Squarespace's domain settings, open the nameserver settings and replace the existing nameservers with Cloudflare's assigned pair. Use the nameserver setting, not new NS records in the ordinary DNS record editor.
6. Wait until Cloudflare reports the domain as Active. From then on, make DNS record changes in Cloudflare; renew the domain through Squarespace.

## 3. Attach the domain to Pages

Open **Workers & Pages → the Pages project → Custom domains → Set up a domain**. Add `gettastemate.com`, then add `www.gettastemate.com` separately. Follow the displayed DNS and certificate setup. Cloudflare can create the required CNAME records in the active zone.

Replace only conflicting old website/parking A, AAAA, or CNAME records at `@` and `www` when the Pages setup requests it. If the old ChatGPT Sites custom-domain association blocks setup, detach those custom hostnames from the old deployment during the cutover. Keep unrelated DNS records.

Do not merely add a CNAME without registering that hostname in the Pages project's **Custom domains** screen. The DNS target must be the actual project hostname shown by Cloudflare, and both custom hostnames must finish activation.

Confirm that both HTTPS URLs load without a sign-in requirement and that the privacy link works. Check the desktop/extension connection from `https://gettastemate.com`, using extension 0.4.1 or later and an already-connected desktop helper. The temporary `*.pages.dev` hostname is deliberately outside the extension's allowed origins.

Public installer and Chrome Web Store buttons remain unavailable until real releases are configured in `dist/releases.json`; a successful website deployment does not publish those releases.

## References

- [Cloudflare Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Cloudflare nameserver setup and DNSSEC migration](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)

Instructions checked September 30, 2026 Pacific.
