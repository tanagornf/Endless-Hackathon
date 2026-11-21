# F14 payments

| ID | Status | Target mode | Actual mode |
|---|---|---|---|
| F14 | PARTIAL | S | A |

## Slice 1

- The merchant can configure and preview PromptPay, view a list of payment requests, and open a scoped order payment request. The public page displays the recipient, amount, expiry and QR in Thai and English. Sandbox pages and messages explicitly tell the visitor to avoid transferring money.
- F13 confirmation calls the registered payment hook. The hook uses the order price snapshot, a tenant-scoped QR file and a random 192-bit link. Staff GET responses show the masked receiver. A saved, encrypted dispatch link survives a retry until F09 reports actual delivery, and the public endpoint looks up the SHA-256 token hash. Canonical F09 message keys suppress repeats.
- The isolated A2 database and fake model were used for 37 passing tests covering CRC and QR vectors, settings validation, recipient masking, access control, concurrent request issuance, public expiry and English/Thai delivery. Full TypeScript, ownership and smoke discovery passed.
- Bank scanning, live transfers and production merchant smoke have no evidence in this slice. Slip ingestion, verification and settlement are pending.
