# DNS records to add for `stmec.com`

These records authorize Resend (https://resend.com) to send the Wolastoq Bingo
booking-confirmation emails on behalf of `stmec.com`. They all sit under the
`send` subdomain so they will not conflict with any existing email setup at
the root `stmec.com` domain.

Add the following 4 records in stmec.com's DNS panel. Set **TTL** to whatever
the lowest option is (typically 300 / 5 minutes) so verification is fast.

## 1. DKIM — domain verification (TXT)

| Field | Value |
| --- | --- |
| Type | TXT |
| Name / Host | `resend._domainkey.send` |
| Value / Content | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCRubpp6vrJ5MS9f/AaaxZ3CfTQdW/4EMcQxF8IRIp8dZbq4Ro8oAM9FkVH56V8lL/I0eIEl7EARGcHaKp9Lt7EuHMoeRGaIigu3EYbEB1kip7NsGN/P5VFThcsVyaTe+d8oeJmgq1pjT3vY3w01LaHfKeyG/yJoSTJAz3uEO+g7QIDAQAB` |
| TTL | Auto / 300 |

## 2. SPF — sender policy (MX)

| Field | Value |
| --- | --- |
| Type | MX |
| Name / Host | `send.send` |
| Value / Content | `feedback-smtp.ap-northeast-1.amazonses.com` |
| Priority | 10 |
| TTL | Auto / 300 |

## 3. SPF — sender policy (TXT)

| Field | Value |
| --- | --- |
| Type | TXT |
| Name / Host | `send.send` |
| Value / Content | `v=spf1 include:amazonses.com ~all` |
| TTL | Auto / 300 |

## 4. DMARC — recommended (TXT)

Optional but recommended for better deliverability.

| Field | Value |
| --- | --- |
| Type | TXT |
| Name / Host | `_dmarc.send` |
| Value / Content | `v=DMARC1; p=none;` |
| TTL | Auto / 300 |

## Notes for whoever adds these

- The Name/Host values are RELATIVE to the root domain (`stmec.com`). Most DNS
  panels accept the relative form as-is. If your panel asks for the FULL DNS
  name instead, append `.stmec.com` to each Name (e.g.
  `resend._domainkey.send.stmec.com`).
- All four records sit under the `send` subdomain so they will not interfere
  with the existing email setup that handles `Kylepaul@stmec.com` etc.
- Once added, ping Sir Hilbert so we can click "I've added the records" in
  the Resend dashboard. Verification typically takes 5–30 minutes after the
  records propagate.
