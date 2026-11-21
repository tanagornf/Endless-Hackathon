# F14 payments

| ID | Status | Target mode | Actual mode |
|---|---|---|---|
| F14 | PARTIAL | S | A |

## Slice 1

- The merchant can configure and preview PromptPay, view a list of payment requests, and open a scoped order payment request. The public page displays the recipient, amount, expiry and QR in Thai and English. Sandbox pages and messages explicitly tell the visitor to avoid transferring money.
- F13 confirmation calls the registered payment hook. The hook uses the order price snapshot, a tenant-scoped QR file and a random 192-bit link. Staff GET responses show the masked receiver. A saved, encrypted dispatch link survives a retry until F09 reports actual delivery, and the public endpoint looks up the SHA-256 token hash. Canonical F09 message keys suppress repeats.
- The isolated A2 database and fake model were used for 37 passing tests covering CRC and QR vectors, settings validation, recipient masking, access control, concurrent request issuance, public expiry and English/Thai delivery. Full TypeScript, ownership and smoke discovery passed.
- Bank scanning, live transfers and production merchant smoke have no evidence in this slice. Slip ingestion, verification and settlement are pending.

## Slice 2

- The frozen F14 slip service contracts now analyze tenant-scoped PNG, JPEG and WebP files, generate a synthetic test slip and decode its CRC-checked reference. The service invokes the core OpenAI vision wrapper with a strict schema. The model extracts visible fields. The application checks amount in satang, receiver evidence, transfer time, duplicate references, QR integrity and tamper signals.
- Missing QR, lower confidence or a name-only match requires staff review. A malformed model result or exhausted provider budget returns a technical verdict. The sandbox simulator labels its result. A unique tenant/reference claim prevents two concurrent analyses from accepting the same transfer reference.
- A2 ran 51/51 focused tests in fake model mode, with actual PNG/JPEG processing, published QR vectors, both languages on the payment request path, tenant isolation, dry runs, concurrent claims and budget errors. Typecheck, ownership and diff checks passed on the rebased implementation.
- Live OpenAI slip reading, bank confirmation, public/staff slip submission and settlement have no production evidence in this slice. Overall feature status stays A.
