# F30 voice

| ID | Status | Target mode | Actual mode |
|---|---|---|---|
| F30 | IMPLEMENTED | R | A |

## Scope

- A signed one-to-one LINE event requests a bilingual, expiring call invitation without starting an AI text reply or staff handoff. Replays keep the same invite and outbound delivery intent.
- A second signed LINE event from the matching shop, OA and customer proves the browser challenge. Admission rechecks the active shop, account and OA, then reserves one call after explicit consent. The browser connects with an SDP answer. Provider session IDs and the provider key stay server-side.
- The app records only provider-authored captions for opted-in calls. Later calls can retrieve bounded history for the same verified shop and customer. Current shop facts come from the scoped F04 and F10 read services. Usage comes from the final provider duration and otherwise stays unpriced.
- Browser controls stop the microphone and peer connection at end, deadline or lost control. Core owns provider-side close and bounded recovery.

## Acceptance

- The guarded C2 fake-model run passed 28 tests across 7 files. It exercises invitation expiry and replay, wrong shop/OA/customer/browser rejection, revoked OA, provider creation failure, opt-in and replay-safe history, and media teardown.
- C1 verified synthetic app-dev WebRTC audio and bounded provider recovery independently in PR #100. The C2 LINE-to-phone flow has no recorded live acceptance yet.
- The bilingual Playwright smoke covers the public no-invite screen and private history refusal. Production execution and a real LINE-origin phone call remain pending.

## Offline checkpoint

- At 15:18 ICT the unpublished compose 9061752cd0f7fc9c0acf3769a38c825920514689 combined the C2 source with C1 #100 50dc4b8 and public main 794909f. The C2 fake-provider run `npm test -- voice line` passed 78 tests in 17 files. Full typecheck passed and Playwright discovered the two public language smoke cases.
- F30 remains on hold while P0 and P1 are finished. No C2 release PR or real app-origin voice call occurred at this checkpoint.

## Reopened verification

- The lead reopened F30 in issue #1 comment 7060203314. The C2 source was rebased cleanly and locally composed with C1 #100 head 4a80476bd4ad4a57bf19502459fccd9fa59ac575.
- The unpublished exact composition f67833c8baf57eb68354c45be84a219c0f392dcb passed 106 fake-provider tests in 20 files across voice, LINE and verified catalog reads. Full typecheck passed and Playwright discovered both bilingual public cases.
- C2 handset acceptance, including the signed LINE invitation and explicit microphone consent, remains pending. Production visibility stays gated separately.
