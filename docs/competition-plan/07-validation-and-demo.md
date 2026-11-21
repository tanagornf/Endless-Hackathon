# การตรวจงานครบระบบ งบ API และหลักฐานสำหรับกรรมการ

> **อัปเดต 20 พ.ย. 2569:** [PLAN.md](../../PLAN.md) ฉบับ 20 พ.ย. แทนเอกสารนี้ทั้งหมด: ตัด F19 F20 F25 F28 F29 F32 F33 F34 ออกจาก scope (เหลือ 28 ฟีเจอร์ ใช้ได้ไม่จำกัด ไม่มีแพ็กเกจหรือโควตา), แบ่ง lane ใหม่ และ AI ของแอปใช้ OpenAI API อย่างเดียว เนื้อหาด้านล่างเป็นฉบับเก่าที่ไม่ได้แก้ตาม ถ้าขัดกับ PLAN ให้ยึด PLAN
>
> **อัปเดต 18 พ.ย. 2569:** การแบ่งงานในเอกสารนี้ถูกแทนที่ด้วย [PLAN.md](../../PLAN.md) (แบ่งตามฟีเจอร์ 3 คน × 3 lanes, ใช้โค้ด Papi เดิมเป็น reference, บอร์ด agent ผ่าน Codex hooks) ถ้าเนื้อหาขัดกับ PLAN.md ให้ยึด PLAN.md

เอกสารนี้เป็น test plan และแบบบันทึก ไม่ใช่ผลทดสอบแอปใหม่ แอปแข่งขันยังไม่ได้สร้าง ทุก feature ใน [FEATURE_STATUS](templates/FEATURE_STATUS.csv) เริ่มจาก UNIMPLEMENTED การผ่าน checks ของ kit/ตัวช่วยบอร์ดไม่ใช่การผ่าน tests ของแอป

## 1. ใช้สถานะเดียวกันทั้งทีม

| รหัส | ความหมายที่ตรวจได้ | ตัวอย่าง |
|---|---|---|
| R | พฤติกรรมนั้นรันจริงและมีหลักฐานจากระบบที่เกี่ยวข้อง | CRUDที่persistจริง, AIcallจริง, LINEtestaccountที่ส่งรับจริง |
| S | กระบวนการแอปครบและpersistจริง แต่ effectภายนอกใช้ simulatorที่ประกาศ | order/payment workflowในsandboxซึ่งไม่โอนเงินจริง |
| A | มีinterface/adapterหรือทดสอบด้วยfixture/replayเฉพาะส่วน ยังไม่พิสูจน์กระบวนการครบ | webhookpayloadreplay, prerecordedvoice, mockOAuth |
| U | ยังไม่มีimplementationที่พิสูจน์พฤติกรรมได้ | plannedroute, disabledbutton,หน้าว่าง |

แยก `provider_environment=none|simulated|test|live` อีกช่อง การยิง APIผู้ให้บริการจริงในบัญชีทดสอบอาจเป็น R + test โดยไม่ได้แปลว่าproductionพร้อม ส่วนmockของproviderคือ Sเฉพาะเมื่อworkflowแอปรันครบ; หากเพียงreplayโชว์เป็น A แทน

ถ้าหนึ่งfeatureมีหลายพฤติกรรมต่างระดับ ให้แตกsubrows/ใส่detail อย่าใช้ผลหนึ่งcaseเลื่อนทั้งระบบเป็นR ตัวอย่าง commerceมี Rสำหรับบันทึกorder แต่การชำระเงินจริงยังUและslipsimulatorเป็นS

## 2. ข้อมูลสังเคราะห์ที่ใช้ร่วมกัน

ใช้[templates/SPEC.md ข้อ5](templates/SPEC.md)เป็นแหล่งเดียวของseedและassertions: `Demo Boardgame Shop`กับ`Demo Repair Studio` พร้อมSKU/ราคา/ค่าส่ง/slotตามตารางนั้น ไม่สร้างชุดราคาอีกชุดจากตัวอย่างAPIของ02 ไม่ใช้customer/accountIDsของPapi มีownerสองคนกับstaffแยกtenant สินค้าหมดสต็อก บริการเต็มเวลา FAQที่มีคำตอบและคำถามที่ไม่มีข้อมูล

เก็บtimesทั้งหมดเป็นUTCและแสดงAsia/Bangkok เก็บเงินเป็นจำนวนเต็มหน่วยสตางค์ และสร้างรายการเวลาอ้างอิงจากวันdemoจริงเพื่อไม่ให้bookingfixturesกลายเป็นอดีต

มีฐานข้อมูลใหม่สำหรับ clean E2E และมีหนึ่งฐานสำหรับrestart/recovery evidence ไม่resetฐานหลักทุกครั้งเพื่อทำให้ข้อผิดพลาดหาย ห้ามใช้ข้อมูลจริงของลูกค้าหรือบัตร/บัญชีจริงเป็นfixture

## 3. Gates ที่ไม่ควรข้าม

| Gate | ก่อนทำอะไร | สิ่งที่ต้องผ่าน |
|---|---|---|
| G0 Foundation | แยกเขียนdomainจริง | rootinstall/scripts, health, DBconnect/migrate, session/tenantservices, sharedcontract |
| G1 Tenant/permission | เปิดข้อมูลให้UI/provider | cross-tenantread/writeไม่ได้, staffถูกจำกัด, objectownershipเช็กserver |
| G2 Grounded AI | เคลมว่าตอบจากข้อมูลร้าน | modelcallจริง, evidence/source, missingfactถามกลับ, toolsbounded, timeoutชัด |
| G3 Effects | ยืนยันorder/booking/payment | consent, price/versionreload, concurrency/idempotency, durablecommit, failureไม่success |
| G4 Transport | เคลมchannelconnected | providercredentials+signature+callback+ack+dedup+outboxreceiptตามmode |
| G5 Release | ส่งผลงาน | candidateSHAเดียว, cleanbuild, migration/restart, integratedE2E, modeledger, URLสิทธิ์และreceipt |

ไม่ปิดauth/tenantguardเพราะtestทำยาก หากG1หรือG3ยังไม่ผ่านให้pathนั้นอยู่blocked/ไม่เปิดeffectจริงจนแก้เสร็จ

## 4. Acceptance ครบ F01–F36

รายการข้างล่างเป็นอย่างน้อยหนึ่งpositiveและหนึ่งnegative/recoveryต่อกลุ่ม แยกtestfilesเพิ่มตามพฤติกรรมในinventory ไม่เอาการทดสอบว่าปุ่มrenderมาแทนbehavior

| ID | Positive ที่ต้องทำให้เห็น | Negative/recovery ที่ต้องตรวจ |
|---|---|---|
| F01 | freshinstall -> build -> start -> health | API404ไม่ถูกSPAindexกลืน; configขาดfailชัด |
| F02 | login/logout/sessionหมดอายุ/resetตามmode | passwordผิดไม่สร้างsession; cookie/sessionปลอมถูกปฏิเสธ |
| F03 | ownerสลับร้านที่เป็นสมาชิกและstaffเห็นสิทธิ์ของตน | แก้businessId/objectIdข้ามร้านหรือเพิ่มroleเองไม่ได้ |
| F04 | เปลี่ยนbusinesshours/AIcapabilityแล้วruntimeใช้ค่าใหม่ | staffไร้สิทธิ์แก้ไม่ได้; inactivebusinessไม่รับeffect |
| F05 | draftknowledge -> review/activate -> available | deleted/draftข้อมูลไม่ถูกตอบ; activeแต่indexยังไม่พร้อมไม่อ้างพร้อม |
| F06 | CSV/textimportเป็นdraftพร้อมsourceและerrorต่อแถว | malformed/oversize/unsafeURLไม่หลุดไปอ่านprivateaddress |
| F07 | queryไทย/อังกฤษคืนsourceของร้านถูกพร้อมversion | อีกtenant/expiredrevisionไม่ถูกretrieve; unknownไม่แต่งanswer |
| F08 | variants/quantity/currencyราคาcanonicalถูก | negativequantity/pricefromclient/unknownSKUถูกปฏิเสธ |
| F09 | inbound -> persistedhistory -> unread/lastmessageอัปเดต | duplicateinboundไม่สร้างสองข้อความ; reloadไม่หาย |
| F10 | AIread/toolturnจบมีusage/trace/replyfromfacts | promptinjection/unknownfact/toolloop/timeoutไม่ทำunauthorizedeffect |
| F11 | assign/handoff -> AIหยุด -> staffตอบ -> release | staffroleผิดหรือstaleassignmentไม่ย้ายงานคนอื่น |
| F12 | template/richreply/translateส่งตามchannelcapability | templateinvalidหรือmodeltranslationfailureไม่ปลอมdeliverysuccess |
| F13 | quote -> userconfirm -> order -> staffshipping | staleprice, duplicateconfirm,stockraceไม่สร้างยอด/ออเดอร์ผิด |
| F14 | paymentrequest/sliptestตามmodeพร้อมsnapshot | failed/unverifiedslipไม่markpaid; amount/currencymismatchถูกblock |
| F15 | checkslot -> confirm -> appointment -> reminderjob | สองคำขอชนslotได้ผลสำเร็จตามcapacity; stale/retryไม่จองซ้ำ |
| F16 | Googletestcalendarcreate/update/cancelมีexternalID | grantrevokedหรือproviderfailเกิดpending/errorไม่อ้างว่าจองexternallyแล้ว |
| F17 | LINEtestinbound -> AI -> replyที่ผู้รับเห็น | invalidsignature/duplicateevent/deadreplytokenมีผลตามoutboxpolicy; eventIDเหมือนกันต่างchannelยังรับครบ |
| F18 | FB/IGtestreceive/replyและpage/accountscope | tokenexpiredหรือpermissionขาดไม่แสดงconnected/sent |
| F19 | WhatsApptestmessages+consent/templatepath | outsideallowedwindowหรือunapprovedtemplateถูกblock/queueชัด |
| F20 | contact/historyimportมีprogress/cursor/retention | resumeไม่duplicate; disconnectไม่ใช้credentialที่ถูกเพิกถอน |
| F21 | commentrule -> private/publicreplyตามpermission | replayeventไม่spam; unsupportedcommentไม่ทำeffect |
| F22 | liveproductcode -> cart -> presentationdatefilter | codeหมดอายุ/สินค้าคนละร้าน/duplicatecommentไม่เพิ่มผิด |
| F23 | broadcastpreview -> approve -> recipients -> jobresults | no-consent/duplicatejob/providerfailไม่ส่งซ้ำหรือรายงานครบเท็จ |
| F24 | customercontact/tag/note/automationจากeventจริง | staffไม่มีสิทธิ์แก้PIIไม่ได้; tagjobretryไม่duplicate |
| F25 | formtoken -> submit -> savedcontactwithconsent | expiredtoken/forgedtenant/oversizedpayloadถูกปฏิเสธ |
| F26 | summary/insightอ้างconversationที่เกิดจริง | emptyperiod/LLMerrorไม่เติมcount/sentimentมโน |
| F27 | dashboardusage/cost/traceสัมพันธ์กับeventsที่เพิ่งทำ | failure/zerousage/timezoneboundaryไม่เกิดยอดติดลบหรือเลขdemoปลอม |
| F28 | quotareserve -> consume/releaseและfeaturegate | parallelturnsไม่overspendโดยไม่bounded; exhaustedaccountไม่เรียกmodel |
| F29 | testcheckout/webhook -> invoice/entitlementตามstate | invalidsignature/duplicate/out-of-orderwebhookไม่เพิ่มcredit/renewซ้ำ |
| F30 | microphone -> STT -> sharedAI -> TTSตามmode | micdenied/timeout/terminationคืนresourceและไม่ลดยอดซ้ำ |
| F31 | in-appnotificationunread/readและpushตามmode | no-permission/revokedsubscriptionไม่ทำให้coretransactionfail |
| F32 | helpquestion/supportticket/feedback/answerreportpersist | helpagentไม่อ่านmerchantdataนอกscope; failedjobไม่แสร้งส่งticketแล้ว |
| F33 | adminviewaccount/usage/planreplacementพร้อมaudit | merchantstaffเรียกadminAPIไม่ได้; planchangeไม่ย้อนหลังแก้invoice |
| F34 | legalversionacceptance/export/deleteตามscope | ยังไม่acceptไม่ทำgatedaction; deletionไม่ลบtenantอื่น/financialledgerผิดpolicy |
| F35 | workerrestartหยิบpendingjobต่อพร้อมattemptlog | expiredlease/partialsend/retryมีdedupและไม่exactly-onceclaimข้ามprovider |
| F36 | buildSHA -> deployedartifact -> fullE2E -> submitreceipt | unsaved/unpushedsourceหรือtestคนละSHAถูกตรวจพบ |

Ops annexของF35/F36: ถ้าจะสร้าง SheetBot/SrsBotใหม่ ให้ทดสอบกับfixture spec/API inventoryและcapture commentในsandboxก่อน ไม่มีสิทธิ์ให้โพสต์Docsหรือแก้liveAWSโดยอัตโนมัติเพียงเพราะมีmoduleในscope FetchMatchXGเป็นancillaryexternaltestadapterแยกจากAIcore ห้ามเปลี่ยนชื่อว่าทำmerchantintegrationแล้ว

## 5. งานทดสอบกระจายอย่างไร

Aทดสอบbrowserflowและpermission/loading/error statesของUIที่เขียน Bทดสอบdomainstate/LLMtools/validatorsด้วยfixtures Cทดสอบจริงข้ามmodule, DBtransactions, role/tenant, workerrestartและartifact ตัวtestจำลองต้องระบุmock boundary

การใช้fakeLLMเพื่อunit-testทำได้ แต่ผลนั้นไม่พิสูจน์ว่าmodelจริงเลือกtool/ตอบภาษาไทยถูก ต้องมีopt-inlivecasesแยก ใช้casesที่ทีมยังไม่ได้ใช้ปรับpromptบางส่วน เช่นสินค้าหรือคำถามใหม่จากfixtureที่Cปิดไว้ก่อนรัน

ไม่ต้องrunfullsuiteทุกครั้งที่แก้spacing แต่ต้องrunaffectedchecksและrequiredgatesก่อนmerge/release หากtest failให้บันทึกexpected/actual/stack/commitและfix; ไม่แก้assertionให้ตรงbugโดยไม่มีเหตุผล

## 6. งบของทีม

ข้อมูลจากผู้ใช้: APIcreditUS$100ต่อคนรวมมูลค่าUS$300 และChatGPTแพ็กเกจมูลค่าUS$100ต่อคนสามบัญชี ชื่อแพ็กเกจจริงและincludedusageต้องตรวจentitlementที่ได้รับ ไม่ใช้ชื่อPlusหรือProที่ยังไม่ยืนยันเป็นสมมติฐานเรื่องlimit

ใช้Codexผ่านสิทธิ์แต่ละคนสำหรับcodingตามที่planรองรับ และใช้APIสำหรับแอป/paidtests หากเปลี่ยนCodexไปauthด้วยAPIkeyค่าcodingจะมากินAPIcreditก้อนเดียวกัน ต้องบันทึกด้วย ไม่ถือว่าUS$300โอนรวมเป็นwalletเดียวหรือเพิ่มrate limitรวมได้

| บัญชี | coding/APIdevelopmentเพดานเริ่มต้น | paidruntime/evaluationเพดาน | reserveที่ยังไม่ใช้ |
|---|---:|---:|---:|
| A | $15 | $15 | $70 |
| B | $25 | $35 | $40 |
| C | $15 | $45รวมdemo | $40 |
| รวม | $55 | $95 | $150 |

นี่เป็นplanningcapsไม่ใช่ข้อจำกัดbillingของOpenAIจริง ถ้าruntimeproductiondemoใช้projectของCก็ต้องอยู่ในยอดของC ไม่สามารถใช้reserveของAโดยอัตโนมัติ การย้ายtest/ownerทำเฉพาะตามสิทธิ์และเงื่อนไขcreditที่อนุญาต ไม่แชร์secretบนบอร์ด

ต้องตรวจbalance/expiry/modelaccessก่อนงานและอีกครั้งก่อนdemo บันทึกprojectaliasไม่บันทึกkey จำนวนcallsไม่ใช่ราคา ต้องเก็บinput/output/cached/reasoningtokensตามusageที่providerคืน รวมtool/image/audiofeesถ้ามี modelrequestควรboundedด้วยmaxoutput, deadline, retrylimitและconcurrency เลี่ยงส่งhistoryทั้งrepo/ทั้งchatทุกครั้ง

ตัวอย่างคำนวณตามราคาStandardshortcontextณที่ตรวจ: GPT-6.1Solinput$2และoutput$10ต่อหนึ่งล้านtokens ดังนั้นinput10ล้าน+output1ล้านประมาณ$30ก่อนtool/mediafees ไม่ใช่คำคาดการณ์ว่าจะใช้เท่านี้ และราคาAPIใช้ประเมินincludedsubscriptiontasksไม่ได้ [ราคาAPI](https://developers.openai.com/api/docs/pricing), [Codexbilling](https://learn.chatgpt.com/docs/pricing)

PlatformCควรreserveงบก่อนcallภายใต้transaction บันทึกusageจริงแล้วsettle/release ป้องกันparallelturnsผ่านguardทีละอันแล้วรวมเกินงบ เตือนเมื่อ70%และหยุดpaidbatchที่90%ของplanningcap เว้นreserveสำหรับdemo ไม่ตีความหน้าbudgetalertของproviderเป็นhardcapที่ตอบทันที

## 7. หลักฐานจากศูนย์และการใช้ Codex

ใช้ [SOURCE-BASELINE](templates/SOURCE-BASELINE.md), [EVIDENCE](templates/EVIDENCE.md) และfeatureledger บันทึกก่อน10:00น.ว่าอะไรมีมาก่อน: spec, workflowtools, dependencies/assetsที่ประกาศไว้ และโค้ดแอปเดิมต้องไม่มีในcompetitionrepo ตามกติกาพัฒนาใหม่ในงาน

หลักฐานที่เก็บระหว่างงาน:

1. baselineSHA, startเวลาไทย, treeและรายการpreexisting
2. taskowner/allowedpaths/acceptanceและpromptสำคัญ
3. PR/diff/commitที่Codexช่วย พร้อมสิ่งที่มนุษย์ตรวจ/แก้
4. model/tooltraceที่redactแล้ว, providerreceiptที่แยกtest/live/simulated
5. testresultsของSHAนั้น, featurestatusทั้ง36กลุ่มและข้อผิดพลาดที่ยังเหลือ
6. finalpushedSHA, artifactSHA, health/E2Eที่targetจริง, submissionreceipt

Commits/เวลาหรือวิดีโอเป็นหลักฐานประกอบ ไม่ใช่ข้อพิสูจน์ลำพังว่าโค้ดไม่เคยมีมาก่อน อย่าสร้างlogย้อนหลังให้ดูเหมือนทำในวันงาน อย่าใช้recordedvideoโดยพูดว่าเป็นlivedemo

ตัวอย่างCodexstoryที่ควรเก็บ: ให้สร้างorderconfirmation -> testพบrequestซ้ำสร้างorderสองครั้ง -> ทีมระบุinvariant -> Codexแก้transaction/idempotency -> independentreview+testsยืนยัน ตัวนี้อธิบายeffectiveuseได้ตรวจตามจริง โดยไม่อ้างว่าผู้จัดให้คะแนนเท่าใด

## 8. การสาธิตที่พาทุกระบบเข้ามาในเรื่องเดียว

ใช้เรื่อง “เจ้าของร้านเปิดพนักงานขายและบริการ AI ที่ทีมควบคุมได้” ในdemoหลัก ไม่เปิด47เมนูอย่างละ2วินาทีแล้วหวังว่ากรรมการเห็นความลึก

| ช่วงซ้อม | สิ่งที่ทำในแอป | สิ่งที่พิสูจน์ |
|---|---|---|
| 0:00–0:25 | ownerเลือกbusiness/ตั้งค่าและstaff | tenant/role/onboarding |
| 0:25–0:55 | importข้อมูลใหม่และactivateเมื่อพร้อม | knowledge/catalog/source lifecycle |
| 0:55–1:35 | ลูกค้าถามจากwebหรือchannelที่เชื่อมจริง | AI/RAG/history/transport/trace |
| 1:35–2:05 | ขอคำสั่งนอกpolicyแล้วระบบถาม/ปฏิเสธ | deterministicguards/depth |
| 2:05–2:45 | confirmorderหรือbooking แล้วstaffเห็นstate | consent/persistence/transaction/handoff |
| 2:45–3:15 | เปิดCRM/insight/usageจากสิ่งที่เพิ่งเกิด | downstreamworkflow ไม่ใช่fakeanalytics |
| 3:15–3:45 | staffขอadmin/tenantอื่นแล้วถูกปฏิเสธ | securityที่ทดสอบได้ |
| 3:45–4:20 | featureledgerของchannels/live/broadcast/voice/billing | coverageและtruthlevels ไม่ซ่อนงานที่ยังไม่จบ |
| 4:20–5:00 | baseline->tasks->Codexfix->tests->artifact | การพัฒนาใหม่และeffectiveuseofCodex |

เวลานี้เป็นscriptซ้อมของทีม ไม่ใช่pitchtimeทางการ เตรียม3นาทีและ5นาทีไว้และปรับตามbriefจริง คำพูดอังกฤษตัวอย่าง: “We rebuilt these workflows today. This path is running against the test provider; this one uses our simulator. Here is the state change, the test, and the commit.” ต้องเปลี่ยนตามผลจริง ไม่ใช้คำพูดตัวอย่างแทนหลักฐาน

ถ้าทำครบ36กลุ่มไม่ได้ ให้โชว์coverageledgerตรงไปตรงมาและสาธิตเส้นที่ทำงานจริง ยังรักษาเป้าหมายrebuildครบระบบไว้ในbacklog การบอกข้อจำกัดที่มีอยู่จริงไม่เท่ากับยอมลดโจทย์ตั้งแต่ต้น

## 9. เชื่อมกับเกณฑ์ผู้จัด

| เกณฑ์ทางการ | หลักฐานที่ทีมเตรียม | สิ่งที่ไม่ควรใช้แทน |
|---|---|---|
| Problem framing | ผู้ใช้จริงปัญหาชัด ข้อมูล/feedbackที่ได้รับอนุญาต และworkflowที่เลือก | จำนวนfeatureหรือคำว่าAIplatformอย่างเดียว |
| Build quality | E2Eบนartifact, failure/restart/idempotency/permission tests | startupsuccessหรือภาพเมนู |
| Depth of thinking | tenant/consent/version/state/sideeffect/providermodeและtradeoffs | เพิ่มagentเยอะโดยไม่มีเหตุผล |
| Effective use of Codex | tasks/parallelownership/PRdiff/humanreview/testbugfixevidence | จำนวนpromptsหรือค่าAPIที่ใช้หมด |

ตารางการเตรียมหลักฐานนี้เป็นการวิเคราะห์เพื่อเตรียมทีม ไม่มีน้ำหนักคะแนนย่อยที่ผู้จัดประกาศ และไม่มีฐานให้รับประกันว่าการสร้างระบบใหญ่กว่าจะชนะ [FAQผู้จัด](https://luma.com/39zve8ph)

## 10. เช็กลิสต์ก่อนส่ง

- [ ] freshinstall/build/startและcriticalE2EตรงcandidateSHA
- [ ] tenant/roles/consent/idempotencyไม่มีblockerที่ปกปิด
- [ ] sourcebranchpushแล้วและfinalartifactตรงcommitที่ส่ง
- [ ] featureledgerครบF01–F36 ทุกclaimมีหลักฐานและproviderenvironment
- [ ] noPapioldimplementation/backendcallsในfreshappที่อ้างfromzero
- [ ] ไม่มีcredential/customerdataในGit, screenshots, tracesหรือvideo
- [ ] repo/demoURLที่ผู้จัดเข้าถึงได้และsubmissionreceiptเก็บแล้ว
- [ ] มีlocalfallback/recordedbackupพร้อมระบุสถานะ
- [ ] ทุกคนรู้ส่วนที่สร้าง สิ่งที่ยังไม่ได้พิสูจน์ และคำตอบเรื่องCodexusage
