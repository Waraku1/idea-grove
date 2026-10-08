# Idea Grove — Renderでの無料公開

選定日: 2026-10-05。所有者はCloudflareに代わる公開先としてRenderを希望。費用0円を優先し、無料上限による休止を許容する公開ベータを対象とする。

## 選定

**Render Free Web Service + Neon Free PostgreSQL + GitHub OAuth** を公開先と保存・認証の構成にする。Renderの無料PostgreSQLは30日で失効するため、継続保存には使用しない。無料Webサービスのローカルファイルも再起動・休止・再デプロイで失われるため、SQLiteや保存ファイルを置かない。

| 方式 | 一般公開と保存 | 判断 |
|---|---|---|
| Cloudflare Workers Free + D1 | 現在のコードで対応済み。動的リクエスト・CPU・DBに無料上限あり | 既存の公開経路を保管。今回はRenderを優先 |
| Render Free Web + Render Free PostgreSQL | Webは休止あり、DBは30日で失効 | 継続保存に不適切 |
| Render Static Siteだけ | CDNから配信できるが、現在の認証・保存APIは実行できない | 保存機能を失うため、そのまま採用しない |
| Render Free Web + Neon Free | 休止・利用量上限あり。超過時も保存データを保持する無料DBを使用 | 費用0円の公開ベータとして選定 |

Render自身はFreeインスタンスを本番用途に推奨していない。今回の構成は制限を明示した公開ベータであり、常時稼働や無制限の利用を保証する構成ではない。利用者の保存データを端末だけに置く方式には変更しない。

## 費用を発生させない条件

- Renderの対象ワークスペースはHobby、サービスはFree。**支払い方法を登録していない専用ワークスペース**を確認してから公開する。既存の有料契約・支払い方法・他プロジェクトを変更しない。
- 現行Hobbyの月間転送量は5 GB。支払い方法があると超過分が課金されるため、予算通知だけに頼らない。支払い方法がない場合は無料サービスを月末まで停止する。
- Free Webは15分間リクエストがないと休止し、再起動は約1分。月750時間を同じワークスペースの無料Webサービス全体で共有し、超過すると停止する。起動を維持する監視・定期アクセスは設定しない。
- ビルド時間もワークスペースの無料枠を使う。無料枠超過時に追加購入しない。最初は手動リリースとし、不必要な連続ビルドを避ける。
- Neonは**Free**を確認する。公式資料の2026-10-01更新では、プロジェクトあたり1 GBのPostgreSQL保存量、100 CU-hours/月、5 GB/月の転送量。古い検索結果の0.5 GBを採用しない。
- Neon Freeではコンピュート・転送量の上限で停止し、保存量の上限では増加する書き込みが失敗する。Freeの超過料金はなく、上限到達だけではデータは削除されない。有料Launchへ移行しない。
- Renderの無料onrender.com URLを使う。ドメイン購入、有料ディスク、有料DB、自動スケール、有料監視を追加しない。

## 実装済み — Release 0.6

- 現在の画面・3D世界をViteでビルドし、Node.js 22.18のサーバーから配信する。`pnpm build:render` / `pnpm start:render`。Sitesの認証ヘッダーをインターネットから信頼する経路はない。
- GitHubの署名付きHttpOnly/Secure Cookieで本人を確認し、`/session`から画面を起動する。APIは安定したGitHub IDで所有者を分離する。既存のOAuth state / PKCE、同一オリジン検査、管理者制限、保存停止を共有する。
- Neonの公式HTTPドライバーを使用する。専用スキーマは `deployment/render/schema.sql`。世界と履歴の保存、本人の消去はそれぞれ単一SQL関数内のトランザクションで処理し、同一所有者の保存・消去をロックする。古いrevisionは競合として拒否する。
- 設定やDBスキーマが不完全ならサーバーは起動しない。秘密値をブラウザ用バンドル・応答・ログに含めない。ヘルスチェックの都度DBを起こさない。
- `render.yaml`はFree・Singapore・1インスタンス・手動リリース・初期保存停止。ディスク、Render Postgres、有料スケールは含めない。公開用Privacyと管理画面はRender/Neonに対応済み。
- 保存・履歴・同時保存・ロールバック・本人だけの消去を、実PostgreSQLエンジンのPGliteで検証した。全85件のテストと型検査はPASS。実Neon接続と実GitHub認証はアカウント設定後に検証する。

## 実アカウントでの公開手順

1. Renderに所有者が安全にログインし、対象ワークスペースのHobby契約と支払い方法未登録を確認する。ログイン情報や認証コードを会話に送らない。新規登録のパスワードと規約同意は所有者がブラウザで操作する。
2. Idea Groveだけの非公開GitHubリポジトリを用意し、検証済みソースを同期する。Renderにはこのリポジトリだけの読み出しを許可する。Sitesの短期Git credentialをRenderに保存しない。無関係の既存リポジトリを公開先にしない。
3. Idea GroveだけのNeon Freeプロジェクト・空のDBを作成し、SQL Editorで `deployment/render/schema.sql` を一度だけ適用する。Renderと近いSingaporeを選ぶ。既存サービスのDBには適用しない。TLS必須の接続文字列はRenderの `DATABASE_URL` にだけ登録する。
4. GitHubの専用OAuth Appと、確定した公開URLのコールバックを設定する。管理者は確認済みのWaraku1（GitHub ID 153403020）。認証秘密値はRenderの秘密環境変数に置く。
5. `render.yaml`で新規Free Web Serviceを作成する。割り当てられた実際のURLをOAuthに登録する。URL確定前の設定不足で起動が失敗する場合は、そのまま秘密設定を完成させて再デプロイする。架空の値で起動検査を回避しない。
6. 初期値 `APP_READ_ONLY=true` のまま、正常な起動、ヘルス、匿名API拒否、GitHubログイン、管理者限定画面を確認する。実契約と秘密設定が揃った後、検証用アカウントで保存を有効にして、2アカウントの分離、保存・履歴・再読込・消去・休止後のデータ保持を確認する。検証用データと本番の思考を混ぜない。
7. 検証と無料設定の記録後に一般公開URLを案内する。以降は `RENDER_OPERATIONS.md` の手動運用を行う。Neon Freeの復旧履歴は6時間であり、D1の7日手順を流用しない。

### 秘密環境変数

| 名前 | 登録内容 |
|---|---|
| `DATABASE_URL` | 専用Neon DBのTLS接続文字列 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Idea Grove専用OAuth Appの値 |
| `SESSION_SECRET` | Render生成の256-bit乱数。漏洩時は更新して再ログイン |
| `OWNER_GITHUB_ID` | `153403020` |
| `APP_READ_ONLY` | 公開確認前は `true`、保存を有効にするときは `false` |

Renderが提供する `RENDER_EXTERNAL_URL` を固定のOAuth originとして使用する。独自ドメインは追加しない。OAuth AppのHomepageはその実URL、Authorization callbackは実URLの `/auth/callback`。要求scopeは追加しない。管理画面は `/admin`。

`sync: false` の秘密値はBlueprint初回作成時に入力する。後から追加・更新するときはRenderのEnvironment画面で設定する。GitHub・Neon・Renderの規約同意、新規認証情報、アプリへの新しい権限付与は所有者が安全な画面で確認する。

旧SitesのDBは変更しない。旧サイトから本人がJSONを書き出して新しい自分のアカウントへ復元する。2026-10-06時点でRender用実装は完了。操作用ブラウザにはログイン画面が表示され、ユーザー側のログイン状態は共有できていない。外部公開URL、Renderサービス、Neonプロジェクト、課金設定の実確認は未完了。

## 公式資料

- https://render.com/docs/free
- https://render.com/docs/outbound-bandwidth
- https://render.com/docs/static-sites
- https://render.com/docs/blueprint-spec
- https://render.com/docs/environment-variables
- https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md

公開時に実際のアカウント画面で契約と上限を再確認する。公開できることと、アクセスに関わらず全機能が継続することを区別する。
