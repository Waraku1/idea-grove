# Idea Grove — 外部公開の手順

更新: 2026-10-05 / リリース候補: 0.5

## 公開先の変更

2026-10-05の追加指示により、外部公開は **Render Free Web Service + Neon Free PostgreSQL** を対象に進める。選定理由、費用を発生させない条件、実装・接続の残作業は [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) を参照。以下は実装済みのCloudflare公開経路の記録であり、現在の公開先を示すものではない。Renderへの一般公開はまだ完了していない。

## 決定事項と現在地

| 項目 | 決定 |
|---|---|
| 公開先 | 専用の Cloudflare Workers **Free** アカウント |
| URL | 無料の `https://idea-grove.<account-subdomain>.workers.dev`。独自ドメインを購入しない |
| 保存 | D1 Free。現在状態と変更履歴を利用者ごとに保存 |
| 認証 | 新規の専用 GitHub OAuth App。メール・リポジトリ権限を要求しない |
| 管理者 | 確認済み GitHub アカウント `Waraku1`、固定ID `153403020` |
| 費用の制約 | 有料契約・超過課金を有効にせず、無料上限で停止する |
| リリース | テスト → 型検査 → 専用ビルド → 課金状態の再確認 → 公開 → 実サイト検証 |
| 既存データ | 旧サイトでJSONをエクスポートし、新サイトに本人が復元。メールで所有者を推定しない |

独立した本番ビルド・認証・管理画面・費用確認スクリプトを実装済み。Cloudflareアカウント、OAuth App、本番D1、GitHubの配布用リポジトリはまだ作成・接続していない。例示URLは未取得であり、公開URLとして案内してはいけない。

## 0円の境界

2026-10-05の公式資料に基づく。契約条件の変更時は再確認する。

| 対象 | 無料上限・動作 |
|---|---|
| 静的配信 | ファイルへのリクエストは無料・無制限。Workerより先に配信 |
| 動的ページ・API・認証 | Workers Free: アカウント合計100,000リクエスト/日、CPU 10ms/リクエスト。上限で失敗し、有料へ自動移行しない |
| D1読み出し・書き込み | アカウント合計500万行読み出し/日、10万行書き込み/日。超過時はクエリが失敗 |
| D1保存量 | 1データベース500MB、アカウント合計5GB。上限で保存を停止 |
| 復旧 | D1 Free Time Travelは7日。内容の消去と復旧の整合性は運用手順を守る |
| ビルド | 当初は手元の検証済み成果物を直接公開。課金されるCIを接続しない。Workers Buildsを後で使う場合はFreeの3,000分/月と契約を確認 |
| 天気 | Open-Meteoの非商用無料APIを使用。現在は非商用・広告なし。10,000回/日の提供元上限を守り、取得失敗時は前回値または時刻だけを表示 |

**費用0円と、アクセス無制限で全機能を継続することは別条件。** この構成では閲覧ページもSSRを使うため、動的リクエスト上限に達するとサイトの初回表示自体が止まることがある。キャッシュ済みファイルが無制限でも、サイト全体の無制限稼働は約束しない。無料枠は同じアカウントの他サービスと共有されるため、専用アカウントを使う。

有料アカウント内で「無料枠内に収める」運用は採用しない。予算通知は超過課金の停止装置ではない。ドメイン購入、Paidプラン、R2、Workers AI、KV、Queues、外部ログ収集、カード決済を追加しない。

## 初回セットアップ

1. 所有者のCloudflareアカウントでWorkersのFreeプランを確認する。既存の有料アカウントは変更せず、別のFreeアカウントを選ぶ。無料のworkers.devサブドメインを登録する。
2. `idea-grove` というWorkerを作成する。最初はデータを扱わない短い準備中応答でよい。これはシークレット設定のための準備であり、完成版の公開ではない。プレビューURLを無効にする。
3. `idea-grove-production` のD1を作成する。返された実在のAccount ID / Database UUIDを記録する。名前だけからIDを作らない。
4. `deployment/cloudflare.example.json` を `deployment/cloudflare.local.json` に複製し、実在のID、確定したworkers.dev URLを入力する。初回準備中は `APP_READ_ONLY` を `true` にする。このファイルはGit対象外。シークレットを記載しない。
5. GitHubで新規の専用OAuth Appを所有者名義で登録する。Homepage URLは確定URL、Authorization callback URLは **`<PUBLIC_ORIGIN>/auth/callback`**。Client IDのみローカル設定の公開変数に入力する。
6. Client Secretと、暗号学的乱数32バイト以上をbase64url化した43文字以上のSESSION_SECRETをCloudflare Workerの暗号化されたシークレットとして登録する。名前は `GITHUB_CLIENT_SECRET` / `SESSION_SECRET`。値をソース、コマンド引数、ログ、会話に貼らない。`SESSION_SECRET`を更新すると全セッションが無効になる。
7. 本番D1のSQL画面で、空のDBに次の2ファイルを順番に一度だけ適用する。既存DBへの再実行は避ける。
   - `drizzle/0000_icy_red_hulk.sql`: worlds / world_events
   - `deployment/0001_account_erasures.sql`: 消去記録。旧SitesのDBには不要
8. ソース管理は所有者の非公開GitHubリポジトリを使う。接続済みSitesのソースも残す。権限は必要最小限にし、2要素認証を有効にする。接続がない状態では「作成済み」と記録しない。
9. Cloudflare API Tokenを対象アカウントに限定して用意する。Billing Read、Workers Scripts Edit、D1 Read/Editなど、契約・シークレット名・DB構造の確認とデプロイに必要な権限を設定する。秘密値はプロセス環境にだけ渡す。Global API Keyを使わない。

実際の作成・登録・公開は所有者のアカウント接続後に行う。ブラウザでの接続が必要な場合も、パスワードや2要素認証コードをチャットに送らない。

## リリース

```sh
npm run release:cloudflare
```

このコマンドは実設定、Account subscriptions APIによる無料契約、本番にあるシークレット**名**、DBの3テーブルを確認する。APIが読めない、有料・試用・未知の契約がある、IDが仮値、必要なテーブルがない場合は公開しない。無料はCloudflareの既定プラン。空の契約一覧は既定Freeとして扱い、一覧がある場合は価格0のFree契約だけを認める。既存の有料契約を解除する操作は行わない。

続いてテスト、型検査、外部公開専用ビルドを実行し、不要な課金サービスのバインディングを確認する。公開直前にも契約を再確認する。最後にWranglerで公開し、実URLの `/healthz` を確認する。secretの存在は値の強度や正しさを証明しないため、次の実サイト検証も必須。

ブラウザ検証のため初回は `APP_READ_ONLY=true` で公開し、認証・閲覧を確認する。その後Freeを再確認して `false` の設定で再リリースし、保存・バックアップ復元を検証する。DBのデータ移行や削除をリリースコマンドに含めない。検証が失敗したら保存を停止し、告知を保留する。

## 公開判定

- 匿名で例の世界を閲覧でき、偽のユーザーヘッダーを送っても他人のデータが読めない。
- 実際のGitHubアカウントでログイン、ログアウト、再読込できる。callback URL、Cookie属性、管理者IDを確認する。
- 所有者と別の検証用アカウントで、世界と履歴が分離される。検証用アカウントは所有者が用意する。
- Memo保存→再読込→別端末、家具移動、窓越しの描画、一人称移動を実ブラウザで確認する。
- JSON export / import、競合保存、通信失敗、保存停止が意図通り動き、既存の世界を失わない。
- テスト用の世界の消去で現在状態・履歴が消え、他ユーザーの内容は保持される。本物のデータを消去テストに使わない。
- Free契約、DB使用量、日次リクエスト、CPU時間を確認し、公開時点のURL・Worker version ID・ソースSHA・日時・確認者を運用記録へ残す。

この環境でブラウザ操作とFreeの本番CPU上限の実測は未実施。ビルド成功だけで一般公開完了や本番の無制限性能を主張しない。

## 旧サイトからの移行

旧サイトのSettingsから `Export my grove`。新サイトにGitHubでログインし、空の自分の世界にJSONを読み込み、確認して復元する。件数・タグ・家具・位置を確認して再エクスポートし、内容を比較する。現在状態とIDは移行できるが、旧クラウドの成長履歴は現行JSONに含まれないため旧サイトを本人限定で保持する。自動的な公開、所有者IDの置換、DBのコピーはしない。

## 公式資料

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) / [limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) / [limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Workers Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- [Account subscriptions API](https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/methods/get/)
- [GitHub OAuth / PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [Open-Meteo terms](https://open-meteo.com/en/terms)
