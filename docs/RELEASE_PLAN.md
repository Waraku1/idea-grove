# Idea Grove — 初回公開契約とロードマップ

決定日: 2026-10-04 / 初回版: private alpha 0.1

## 公開方針

実装と視覚フィードバックを優先する。初回は本人限定の稼働プロダクトとして公開し、一般公開は操作検証と保存・復旧の検証後に進める。

## 固定事項

- 館は中央樹を囲む12固定スロット。隣接区画だけをユーザー操作で統合できる。自動拡張・再配置はしない。
- 外周は手動建築。初回版では家、Shelf / Wall / Desk / Box の追加と座標編集を提供する。
- Memo / Book は共通 KnowledgeObject。本文とタグを持ち、種類の変換でIDを変更しない。初回本文はプレーンテキスト。URLは別欄から開ける。
- Captureにタグ・部屋・配置を要求しない。世界・検索・統計・履歴のどこからも作成できる。
- タグと配置の有無は独立。Inboxは未配置情報を一元管理し、すべて・タグなし・本・保管中のフィルターと検索を提供する。
- Placement は KnowledgeObject と家具のIDを参照。複数配置に本文コピーを作らない。箱の配置によってArchiveを変更しない。箱は1階層で、箱の中に箱を入れない。
- 重要タグは最大10種類、各タグの樹冠方向は安定。通常タグを含め、合計100タグまで。各情報は該当する全重要タグに1ずつ寄与する。
- タグ別割合は現在の非保管情報総数を分母とし、複数タグのため合計100%を超え得る。種類別割合は排他的。配置は件数に加算しない。
- 重要タグがk個の情報は、各ペアに 1 / C(k,2) の正規化強度を与える。共起件数は別に保持する。ツタは同じテクスチャ・色で葉領域を結ぶ。通常描画は強い8ペア、詳細では全ペア。
- 視覚成長は g(n)=1-exp(-n/80) を基礎とする飽和型。実件数は変換せず統計に表示する。木の成熟は累積作成数を使用し、削除・保管で後退しない。現在の葉とツタは現在の非保管情報に対応する。
- ユーザー別に耐久DBへ保存し、変更イベントを同一トランザクションで追記。SitesはD1、選定したRender公開先はNeon PostgreSQL。revisionによる競合検出で別画面の更新を上書きしない。
- 成長史はイベント再生で本文・タグ・建築・配置を再構成する。過去は閲覧専用。過去の閲覧中に開始するCaptureは現在の世界に保存する。
- 本文は作成時に保存要求、編集を800msで自動保存。未送信本文はユーザー別の端末下書きとして保持。オフライン時の空間編集は提供しない。
- JSONバックアップは形式バージョン1の現在状態。復元は内容確認の後に全置換し、その操作自体も履歴へ残す。変更履歴を含む持ち出しは次段階。
- 初回は情報5,000件、タグ100種類、家100軒、家具2,000個、世界データ合計1.5MBまで。バックアップの読込は2MBまで。

## 実装順序と公開条件

| 段階 | 成果 | 完了条件 |
|---|---|---|
| 01: 本人限定alpha | Capture / Inbox / タグ / 空間 / 配置 / 木 / 統計 / 成長史 / バックアップ | ドメイン検証・アクセス分離と保存競合の検証・型検査・本番ビルド・デプロイ成功 |
| 02: 視覚・操作改善 | 添付画像/PDF/ファイル、書式、本文内オブジェクトリンク、直接ドラッグ、Undo、壁/扉/階段/複数階 | 実画面で主要操作検証、容量と描画負荷測定、初回フィードバックの反映 |
| 03: 一般公開候補 | 認証とアクセス方針、同期と復旧、履歴の持ち出し、大量データ対策 | 端末間・同時保存・再接続・復元・キーボード・アクセス分離の本番相当検証 |

## 視覚レビューの観点

1. 木のタグ別葉群とツタが直感的に読めるか。
2. Captureが思考を遮らず、未整理のまま保存できるか。
3. 部屋を選び、家具を置き、情報を配置する手順が分かるか。
4. 木・統計・履歴の数が一致するか。
5. 空間が情報を思い出す手がかりになるか。

## 初回版の技術的境界

空間は独自の3D座標モデルをCanvasで投影する。現在は俯瞰・一人称歩行・室内・同じ風景が見える窓・実天気に対応し、家具・家・情報の配置を移動できる。添付アップロード、共有、協働編集、完全オフライン編集、複数階建築は未実装。ブラウザ検証の環境が利用できない場合はその限界を明示し、一般公開の条件に残す。

## 初回検証結果

- ドメイン・描画座標検証: 14件 PASS。
- 実ハンドラー + SQLiteによるAPI検証: 7件 PASS。D1環境と認証をテスト用に差し替えて、未認証拒否、別ユーザーの非公開データ分離、同時保存の勝者1件・競合1件、イベントの原子的追記、過去状態の再構成を検証。
- TypeScript型検査: PASS。
- Canvasの描画命令をSVGへ変換した静止画像で、木・館・室内の幾何を視覚確認。ブラウザのレイアウトやイベント操作の検証とは別。
- ブラウザ検証: 環境に対応するブラウザ検証スキルがないため未実施。実ブラウザでの保存/再読込、ドラッグ、キーボード操作、端末間利用は次の検証項目。

## Release 0.2 — First-person view and English UI

- Added a First person / Overview switch without replacing the existing overview design or tree geometry.
- Eye-level perspective rendering uses the same stored world positions and deterministic tree. Near-plane clipping prevents inverted or invalid geometry while walking close to surfaces.
- WASD walks; Shift moves faster; mouse drag looks around; arrow keys move and turn; optional mouse lock is released with Escape. E enters a nearby space, inspects furniture, opens a thought or leaves a room.
- The south arch provides a walking route from the settlement into the courtyard. Collision prevents crossing mansion walls, tree trunks, houses, room boundaries and furniture.
- Entering an interior remembers the outdoor position and restores it when leaving. Movement pauses during editing and confirmation, when canvas focus is lost and when the page becomes hidden.
- Base UI, assistance, errors, sample content and date formatting now use English. Existing user content and names are preserved. Legacy system labels are localized only for display; immutable history seeds remain unchanged.
- New walking/projection/localization tests: 10 PASS. Existing domain/API tests: 21 PASS. TypeScript verification PASS.
- First-person garden and interior geometry inspected through SVG exports of Canvas drawing commands. Actual browser pointer lock, keyboard and pointer event interactions remain unverified in this environment.

## Release 0.3 — Shared building geometry and live window views

- Structure audit found that every room used a detached 10 × 10 interior with 3.8-high walls, while houses outside were 4 × 3.4 with 2.7-high walls and mansion rooms occupied radial slots. The old windows were opaque panels over solid walls.
- A common architecture model now defines floors, walls, wall thickness, openings, frames and roofs in world coordinates. Houses retain their actual 4 × 3.4 footprint; mansion interiors follow their slot polygons, including wrapped and merged rooms. Merging removes internal partitions; the seam between slots 12 and 1 no longer produces duplicate walls.
- Large openings face both the courtyard and settlement. Houses have broad windows on all four sides. Window frames and sills are solid geometry; the opening itself shows the same tree, buildings, furniture and ground used by the outdoor scene. Moving a house changes the view through the window. Roof undersides use an interior material.
- The selected overview is a cutaway of that actual room. First-person interiors retain the full walls and roof and use world coordinates throughout. Furniture is also rendered in the external scene, allowing it to be seen through openings.
- Existing furniture coordinates remain normalized from -4 to 4 and map into the actual room footprint. Compact furniture models and footprint checks prevent wall penetration. IDs, stored coordinates, object placements and history seeds are retained without a data migration.
- Walking boundaries, furniture collision, doorway interactions and entrance positions use the shared footprint. The two-unit south arch is present in every view, with the passage excluded from adjacent room floors. Entering selects the nearest actual doorway and preserves the viewing direction; leaving restores a valid outdoor position.
- Horizontal first-person field of view increased from 72° to 82°. Polygon projection, billboards, curves and interaction regions share the same focal length. Near clipping remains active.
- Cached architecture, active placements, object lookup and tree statistics avoid repeated full-world searches during movement. Offscreen surfaces and furniture are culled before drawing.
- Verification: 40 domain/API/walking/architecture tests and TypeScript verification PASS. New checks cover window mesh openings and solid sills, actual rendered landscape changes, doorway spawning, furniture containment at coordinate extremes, shared partitions, wrapped/full-ring merges and the common field of view.
- Visual review uses SVG exports of Canvas drawing commands for outdoor overview, room cutaway, outdoor walking, mansion interior, courtyard-facing windows, house cutaway, house interior and a wrapped merged room. Browser layout, native pointer lock and device rendering performance remain unverified in this environment.

## Release 0.4 — Local weather sky and movable placements

- Added a soft illustrated sky that follows the selected location's current weather and time zone: rounded clouds, a warm sun, night stars and moon, and world-positioned rain or snow. Both viewpoints and window views use the same sky; night and wet weather gently adjust the world palette without changing tree geometry.
- Weather is fetched from Open-Meteo through authenticated endpoints. Current model data refreshes every 15 minutes; rounded location cells coalesce requests in a bounded server cache. Failed updates retain a clearly marked last-known reading for at most three hours, then show time of day only. A live Tokyo forecast was fetched and parsed successfully during implementation.
- Tokyo is the initial region. The weather pill offers city search, explicit device-location selection, manual refresh and an animation switch. Settings and rounded coordinates are kept per user on the device. Reduced-motion preference and hidden-page rendering are respected. Attribution is visible in the weather panel.
- Precipitation falls in world coordinates, stays out of room footprints below roof level and is occluded by actual walls and roof meshes in first person. Rain beyond an opening remains visible through the window.
- Arrange mode moves furniture on the real room floor, outer houses around the settlement, and individual thought placements along their furniture surface. Shelves snap to one of three rows. Drag previews are temporary, one drop creates one cloud-saved change, and cancellation or a failed save discards the preview.
- Overlapping targets can be selected individually from the furniture list or thought editor; numeric position controls remain available. The list can be hidden during arranging and starts hidden on small screens. New furniture searches for available floor positions before insertion; existing positions are not automatically shifted.
- Furniture, house and placement moves patch the existing records without changing content identity, names, tags or statistics. The optional normalized placement position is compatible with version-1 backups and old event history. Movement events persist and replay through the existing per-user revision and transaction mechanism. Queued numeric edits resolve against the latest saved state.
- Verification: 57 tests and TypeScript verification PASS. Checks cover projection/drag-plane round trips, wrapped and truncated rooms, position limits, automatic initial spacing, reversible previews, distinct placement hits, saved movement and historical reconstruction; weather code/time zone/stale-data behavior, bounded request caching, authentication, input validation, finite sky rendering and roof occlusion. Daytime, starry-night, wet-weather and window views were visually reviewed from static drawing exports. The production build is required before deployment.
- Actual browser drag events, layout and device rendering performance remain unverified because this environment has no supported browser verification capability. The private-alpha access audience is preserved.

## Release 0.5 — Ground volume and independent-host release candidate

- Added contiguous faceted soil, stone and bedrock layers beneath the existing circular ground. Its exact radius, top elevation, tree and building positions remain unchanged. The overview framing accommodates the visible depth; first-person and cutaway views use the same terrain geometry.
- Added a separate Cloudflare build target. The original Sites integration stays available for the owner's staging environment. The independent gateway discards incoming identity headers and injects an identity only after a signed secure session is verified.
- Prepared GitHub OAuth with browser state, PKCE S256, same-origin mutation checks, fixed callback origin, short-lived sign-in cookies and seven-day signed sessions. Stable GitHub IDs own data; email and repository permissions are not requested. Tokens are discarded after profile verification.
- Added owner-only administration, health configuration reporting and read-only maintenance. Public beta privacy/data and service-limit pages explain cloud quotas and local drafts. Explicit account erasure removes the verified user's world and history atomically and retains a minimal erasure marker for safe backup recovery.
- Prepared a release command that blocks on paid or unverifiable account subscriptions, placeholder settings, missing secret names or database tables; runs tests, type verification and an independent production build; checks free-only bindings before release; and checks the returned host's health.
- [Deployment](DEPLOYMENT.md) and [Operations](OPERATIONS.md) document source ownership, quota stops, migration, incident response, backups, erasure-aware recovery and rollback. Live account setup and actual public release are pending hosting-account connection.
- Static 3D drawing exports and native browser QA are distinct. Native browser behavior, actual GitHub login, production CPU limits, second-account isolation and external-host availability require live validation before a public-release announcement.
- Verification: 74 tests, TypeScript, independent production build and Wrangler dry-run PASS. [Recorded results](VERIFICATION.md) include static drawing previews and the outstanding live checks.

## Release 0.6 — Render deployment implementation

- Extended bedrock to 2048 world units so its bottom stays outside the supported camera frames. The circular surface, building layout and tree remain the approved design.
- Selected Render Free Web Service with Neon Free PostgreSQL, retaining durable cloud saving and GitHub identity. Free quotas may suspend access; a dedicated Hobby workspace without a payment method is required for zero charges.
- Added a standalone Vite client and Node server, secure session bootstrap, private owner-scoped APIs, compressed immutable assets, host/path restrictions, bounded request bodies and concurrent requests, and a database schema check before startup.
- PostgreSQL functions atomically save world/history and erase one owner's content. A per-owner transaction lock and revision recheck reject conflicting saves and stale saves after erasure.
- Added a Free-only Blueprint, Render/Neon privacy and owner administration, deployment steps and a recovery runbook that preserves erasure markers. Manual deployments and read-only saving are the initial settings.
- Verification: 85 tests and TypeScript PASS, including PostgreSQL engine persistence, rollback, isolation, erasure, session spoofing and static delivery. Render client build and retained Cloudflare build PASS. Sites packaging/deployment is verified separately by the returned native result.
- Actual account billing checks, dedicated GitHub repository/OAuth App, Neon project, Render service and live two-account validation remain open. The shared browser currently shows Render's sign-in page; a login in another browser is not evidence of access in this session.
