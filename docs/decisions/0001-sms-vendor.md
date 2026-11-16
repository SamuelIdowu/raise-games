# 0001 — SMS vendor for phone OTP

- Status: **Decided** (2026-11-16), on the owner's instruction to close open items from research
- Closes: Sprint 3 checklist "SMS vendor decided `[owner decision]`"
- Revisit if: either vendor's written Nigerian rate card or delivery terms change the comparison below

## Decision

**Termii is the primary OTP vendor, on its DND (transactional) route. Twilio stays wired as the fallback.** Both adapters already exist behind `SMS_PROVIDER`, so switching is a config change.

## Why

| Factor                                        | Termii                                                                                                                                 | Twilio                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Nigerian DND handling                         | Has a dedicated `dnd` channel for OTP and transactional traffic. Its docs say the generic route is promotional and must not carry OTPs | DND-capable routes exist, but at premium pricing                             |
| Sender ID registration with Nigerian networks | Handled locally as a Nigerian aggregator                                                                                               | Sender ID registration is required; generic IDs such as INFO are rejected    |
| Price                                         | No public flat rate; the rate card is per channel and on request                                                                       | Public figures conflict widely ($0.0075 to $0.39 per message across sources) |
| Fit with the product                          | Nigeria-first; matches the target market and the "built for the real device" principle                                                 | Global; useful as a second route if Termii has an outage                     |

Nigerian A2P rules (network and vendor guidance): OTPs must go on a transactional sender ID, and a promotional sender ID cannot be reused for OTPs without re-registration. Messages on the wrong route fail silently for numbers on the DND registry, which is the main delivery risk for a phone-OTP product.

## Consequences (done in this change)

- **Bug fixed:** `TermiiSmsAdapter` was sending on `channel: 'generic'` (the promotional route). It now uses `channel: 'dnd'`. A unit test asserts this.
- **Staging gate:** `SMS_ALLOWLIST` (comma-separated E.164 numbers). When set, real SMS goes only to those numbers, and other phones get a clear 403 ("This number is not enabled for SMS on staging"). Production leaves it empty. Unit-tested.
- **Before launch (ops):** register a transactional sender ID "RAISE" with Termii; get Termii's and Twilio's written Nigerian OTP rate cards; set `SMS_PROVIDER=termii`, `SMS_API_KEY` and `SMS_SENDER_ID` in the secrets manager. Proving SMS end to end on staging happens with Sprint 0's F0.11 (staging deploy), which is still open.

## Sources

- [Termii Messaging API — routes and channels](https://developers.termii.com/messaging-api)
- [Termii developers](https://termii.com/developers)
- [Twilio — Nigeria SMS guidelines](https://twilio.com/guidelines/ng/sms)
- [Telerivet — Sending SMS in Nigeria: sender ID registration, DND, silent failures](https://www.telerivet.com/blog/nigeria-sms-sender-id-dnd-compliance)
- [Africa's Talking — DND numbers in Nigeria (transactional bind)](https://help.africastalking.com/en/articles/2241664-does-africa-s-talking-support-sending-of-sms-to-dnd-numbers-in-nigeria)
- [Vonage — Nigeria SMS features and restrictions](https://api.support.vonage.com/hc/en-us/articles/204017133-Nigeria-SMS-Features-and-Restrictions)
- [MessageCentral — Best SMS providers in Nigeria (2026)](https://www.messagecentral.com/blog/sms-providers-in-nigeria)
- [textbee — Twilio SMS pricing in Nigeria](https://textbee.dev/sms-pricing/twilio/ng)
