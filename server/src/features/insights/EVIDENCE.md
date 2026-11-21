# F26 insights

| ID | Status | Target mode | Actual mode |
|---|---|---|---|
| F26 merchant report | Local integration verified | R | A |

## Log

The bilingual merchant report counts live customer chats and their orders over 7 or 30 Bangkok calendar days. The database test covers repeated mentions, cancellation, demo exclusion and a matching SKU in two shops. The HTTP test covers sign-in, tenant membership and invalid periods. Both tests and the workspace typecheck passed. Production verification is pending. Conversation summaries remain a separate F26 slice.
