# Connect gettastemate.com in Squarespace

The installation website is deployed at https://gettastemate.jcmcoding.chatgpt.site and is currently a private preview. Both custom hostnames have been registered with the hosting provider and are pending DNS verification. Connecting DNS does not make a private preview public.

Open the Squarespace Domains dashboard, choose **gettastemate.com**, then **DNS**. Add the records below. Use the default TTL. The Host column is relative to `gettastemate.com`; Squarespace appends the domain automatically.

Replace only existing parking/website A, AAAA, or CNAME records that conflict at `@` or `www`. Keep unrelated email (MX), SPF/DKIM, verification, and nameserver records. This is a DNS connection; the domain stays registered at Squarespace.

| Type | Host | Value |
| --- | --- | --- |
| A | @ | `162.159.143.30` |
| A | @ | `172.66.3.26` |
| CNAME | www | `custom-domains.chatgpt.site.` |
| TXT | _openai-site-verification | `openai-site-verification=Q97a5zZo45y9ryT7rRMhAMl2pZw4l_c2HsgNSqq4Vyg` |
| TXT | _cf-custom-hostname | `4d251484-f335-4328-9210-4d705dfab050` |
| TXT | _openai-site-verification.www | `openai-site-verification=HIufVStrXaqXh_KPoti3nwGh8AqhhkKOohFJDB2I9BU` |
| TXT | _cf-custom-hostname.www | `00dd9d45-5864-4e09-bb98-09e47cbedea5` |

After saving, allow DNS propagation and refresh the custom-domain status in the hosting provider. Additional certificate validation records may appear during provisioning; use the provider's current records if it requests them. Do not change nameservers or buy a Squarespace website plan for this static site.

The site remains a private preview until public access is enabled. Public installer downloads and the Chrome Web Store button remain unavailable until real releases are configured. The installation page itself is already deployed.

Squarespace’s official instructions: https://support.squarespace.com/hc/en-us/articles/360002101888-Edit-your-domain-s-DNS-records

Records retrieved October 1, 2026 UTC (September 30 Pacific).
