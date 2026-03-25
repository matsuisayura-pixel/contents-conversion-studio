const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const iconv = require('iconv-lite');

// YouTube字幕をInnerTube API経由で取得
async function fetchYouTubeTranscript(videoId) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // 1. InnerTube API でキャプション一覧を取得
  const innerRes = await axios.post(
    'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    { context: { client: { clientName: 'WEB', clientVersion: '2.20240101' } }, videoId },
    { headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, timeout: 15000 }
  );
  const tracks = innerRes.data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) return null;

  // 日本語優先、なければ最初のトラック
  const track = tracks.find(t => t.languageCode === 'ja') || tracks[0];
  let captionUrl = track.baseUrl;

  // 2. XMLキャプションを取得してテキスト抽出
  const xmlRes = await axios.get(captionUrl, { headers: { 'User-Agent': UA }, timeout: 15000 });
  const xml = xmlRes.data;
  const texts = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const t = m[1]
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '');
    if (t.trim()) texts.push(t.trim());
  }
  return texts.length > 0 ? texts.join(' ') : null;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const SYSTEM_PROMPTS = {
  video: `あなたはFX投資教育コンテンツのプロの動画脚本家です。秋田式メソッド・peace-methodブランドのFXトレード講座に関するコンテンツを扱います。入力されたコンテンツをYouTube動画用のスクリプトに変換してください。以下の構成で書いてください：

【冒頭フック】視聴者の注目を引く強力な導入（最初の15秒で視聴者を引き込む）
【本編】メインコンテンツを分かりやすく解説
【まとめ】重要ポイントの整理
【CTA（行動喚起）】次のステップへの誘導

台本形式で、ナレーターの読み上げテキストとして使えるように書いてください。`,

  audio: `あなたはポッドキャスト・音声コンテンツのプロのライターです。秋田式メソッド・peace-methodブランドのFXトレード講座に関するコンテンツを扱います。入力されたコンテンツを、耳で聞いて理解しやすい音声原稿に変換してください。

- 読みやすいよう句読点を適切に使う
- 聞き手への呼びかけを自然に入れる（「皆さん」「あなた」など）
- 専門用語は簡単に説明を加える
- テンポよく聴けるリズムを意識する
- 冒頭の挨拶、本編、まとめ・エンディングの構成で書く`,

  pdf: `あなたはFX投資教育の専門家です。秋田式メソッド・peace-methodブランドのFXトレード講座に関するコンテンツを扱います。入力されたコンテンツを、わかりやすいPDF資料・レポート形式に変換してください。

以下の点を守ってMarkdown形式で出力してください：
- # で大見出し、## で中見出し、### で小見出しを使う
- 重要ポイントは箇条書き（- または 1. 2. 3.）で整理する
- **太字**で重要キーワードを強調する
- 読者が理解しやすい論理的な順序で構成する
- まとめセクションを必ず入れる`,

  sns: `あなたはSNSマーケティングの専門家です。秋田式メソッド・peace-methodブランドのFXトレード講座に関するコンテンツを扱います。入力されたコンテンツから、各SNSプラットフォームに投稿できる短いコンテンツを3パターン作成してください。

【Twitterパターン】
- 140文字以内
- ハッシュタグを2〜3個追加（#FX #秋田式メソッド #FX投資 など）
- 興味を引くフックから始める

【Instagramパターン】
- キャプション形式（300〜500文字程度）
- 絵文字を効果的に使用
- 関連ハッシュタグを10個以上

【LINEパターン】
- 親しみやすい口調
- 短めの段落で読みやすく
- スタンプ/絵文字を適度に使用`,

  email: `あなたはメールマーケティングの専門家です。秋田式メソッド・peace-methodブランドのFXトレード講座に関するコンテンツを扱います。入力されたコンテンツをセールスメールまたはステップメールに変換してください。

以下の構成で書いてください：

【件名】クリックしたくなる魅力的な件名（2〜3案）

【プレヘッダーテキスト】（50文字程度）

【本文】
1. 共感・問題提起（読者の悩みに寄り添う）
2. ストーリー（体験談・事例）
3. 価値提供（解決策・メリット）
4. 証拠・実績（信頼性の構築）
5. CTA（行動喚起）（明確な次のステップ）

【追伸（P.S.）】重要ポイントの再強調`,

  seminar: `あなたはプレゼンテーションデザインの専門家です。秋田式メソッド・peace-methodブランドのFXトレード講座に関するコンテンツを扱います。入力されたコンテンツをセミナー用スライドの構成案に変換してください。

以下の形式で各スライドを出力してください：

---スライド[番号]---
【タイトル】スライドのタイトル
【ポイント】
・箇条書きポイント1
・箇条書きポイント2
・箇条書きポイント3
【スピーカーノート】
このスライドで話す内容のメモ
---

スライドは導入→本題→まとめ→CTAの流れで構成してください。`
};

const TONE_MODIFIERS = {
  professional: 'プロフェッショナルで権威のある文体で、専門性を前面に出して書いてください。',
  casual: 'フレンドリーで親しみやすい口語体で、読者に話しかけるように書いてください。',
  educational: '教育的でわかりやすい文体で、初心者にも理解できるよう丁寧に説明してください。'
};

// フォーマット別・長さ別の文字数目安
const LENGTH_MODIFIERS = {
  video: {
    short: '【重要】必ず約2000文字以上で出力してください。動画5〜6分相当のボリュームで、内容を省略せず書いてください。',
    medium: '【重要】必ず約3500文字以上で出力してください。動画10分相当のボリュームで、内容を省略せず書いてください。',
    long:  '【重要】必ず約6000文字以上で出力してください。動画15〜20分相当のボリュームで、内容を詳細に書いてください。'
  },
  audio: {
    short: '【重要】必ず約2000文字以上で出力してください。音声5〜6分相当のボリュームで、内容を省略せず書いてください。',
    medium: '【重要】必ず約3500文字以上で出力してください。音声10分相当のボリュームで、内容を省略せず書いてください。',
    long:  '【重要】必ず約6000文字以上で出力してください。音声15〜20分相当のボリュームで、内容を詳細に書いてください。'
  },
  pdf: {
    short: '【重要】必ず1000〜1500文字以上で出力してください。内容を省略しないでください。',
    medium: '【重要】必ず2000〜3000文字以上で出力してください。内容を省略しないでください。',
    long:  '【重要】必ず4000〜5000文字以上で出力してください。各セクションを詳細に展開してください。'
  },
  sns: {
    short: '各プラットフォーム1パターンずつ、それぞれ十分な文量で作成してください。',
    medium: '各プラットフォーム2〜3パターンずつ、それぞれ十分な文量で作成してください。',
    long:  '各プラットフォーム3パターンずつ、バリエーション豊かに、それぞれ十分な文量で作成してください。'
  },
  email: {
    short: '【重要】メール本文を必ず500〜800文字以上で書いてください。内容を省略しないでください。',
    medium: '【重要】メール本文を必ず1000〜1500文字以上で書いてください。内容を省略しないでください。',
    long:  '【重要】メール本文を必ず2000文字以上で書いてください。ストーリーを丁寧に展開してください。'
  },
  seminar: {
    short: '【重要】必ずスライド8〜10枚分の構成を出力してください。各スライドのスピーカーノートも省略しないでください。',
    medium: '【重要】必ずスライド12〜15枚分の構成を出力してください。各スライドのスピーカーノートも省略しないでください。',
    long:  '【重要】必ずスライド20枚前後の詳細な構成を出力してください。各スライドのスピーカーノートも詳しく書いてください。'
  }
};

const MOCK_RESPONSES = {
  video: `【冒頭フック】
「FXで月10万円を安定して稼ぐ方法、知りたいですか？」

今日は秋田式メソッドの核心、エントリーポイントの見極め方をお伝えします。この15秒で、あなたのトレードが変わるかもしれません。

【本編】
秋田式メソッドでは、相場の「流れ」を3つのステップで捉えます。

ステップ1：大局トレンドの確認
まず日足・週足でトレンドの方向性を確認します。上昇トレンドなら買い目線、下降トレンドなら売り目線を基本とします。

ステップ2：エントリーポイントの絞り込み
4時間足・1時間足でエントリーの精度を高めます。サポート・レジスタンスラインを引き、価格がそのラインに近づいたときがチャンスです。

ステップ3：リスク管理
1トレードのリスクは口座残高の2%以内。これを守ることで、連敗しても資金を守れます。

【まとめ】
・大局トレンドを必ず確認する
・エントリーは複数時間足で絞り込む
・リスク管理を徹底する

この3つを実践するだけで、トレードの勝率は大幅に改善します。

【CTA（行動喚起）】
概要欄のリンクから、秋田式メソッドの無料講座に参加してください。限定特典もご用意しています。チャンネル登録・高評価もお忘れなく！次回もお楽しみに。`,

  audio: `皆さん、こんにちは。peace-methodの秋田です。

今日は、FXトレードで安定した収益を上げるための「3つの鉄則」についてお話しします。

まず1つ目、「トレンドに逆らわない」こと。相場には必ず流れがあります。その流れに乗ることが、FXで勝ち続ける最大のコツです。

2つ目は「エントリーを急がない」こと。初心者の方によくあるのが、チャンスを逃すまいと焦ってエントリーしてしまうパターンです。でも、相場は逃げません。次のチャンスは必ず来ます。じっくり待つことが大切です。

3つ目は「損切りを恐れない」こと。損切りは失敗ではありません。資金を守るための大切な手段です。秋田式メソッドでは、エントリー前に損切りラインを必ず決めるようにしています。

以上、3つの鉄則をお伝えしました。

今日の内容が参考になった方は、ぜひ概要欄のリンクから無料メルマガにご登録ください。毎週、実践的なトレード情報をお届けしています。それではまた次回。ありがとうございました。`,

  pdf: `# FXトレード 秋田式メソッド 実践ガイド

## はじめに

本資料は、**秋田式メソッド（peace-method）**のFXトレード手法をまとめたものです。初心者から中級者まで、安定した収益を目指す方に向けて作成しました。

---

## 第1章：秋田式メソッドの基本概念

### 1-1. トレンドフォローの重要性

FXで安定した収益を上げるには、**相場のトレンドに従う**ことが最も重要です。

- 上昇トレンド：押し目買いを基本とする
- 下降トレンド：戻り売りを基本とする
- レンジ相場：原則ノーポジション

### 1-2. マルチタイムフレーム分析

複数の時間軸でチャートを分析することで、エントリー精度が向上します。

1. **週足**：大局トレンドの確認
2. **日足**：中期トレンドの確認
3. **4時間足**：エントリーポイントの絞り込み
4. **1時間足**：最終エントリータイミング

---

## 第2章：リスク管理

### 2-1. ポジションサイジング

| リスク許容度 | 1トレードのリスク |
|------------|----------------|
| 保守的 | 口座残高の1% |
| 標準 | 口座残高の2% |
| 積極的 | 口座残高の3% |

### 2-2. 損切りの徹底

**損切りはトレードの保険です。** エントリー前に必ず損切りラインを設定してください。

---

## まとめ

- トレンドに従い、逆張りは避ける
- マルチタイムフレームで精度を高める
- リスク管理を最優先にする`,

  sns: `## 【Twitterパターン】

FXで負けが続く人の共通点は「トレンドを無視したエントリー」。秋田式メソッドでは、まず大局を見てから小さい時間軸で絞り込む。これだけで勝率が劇的に変わります📈 #FX #秋田式メソッド #FX投資

---

## 【Instagramパターン】

✨ FXで安定収益を得るための3つの習慣 ✨

💡 1. 毎日チャートを同じ時間に確認する
💡 2. エントリー前に必ず損切りラインを決める
💡 3. 1週間のトレードを振り返る時間を作る

この習慣を続けるだけで、3ヶ月後のトレード力は別人のように変わります。

継続こそが最強の戦略。一緒に成長していきましょう！💪

#FX #FX投資 #秋田式メソッド #peacemethods #FXトレード #為替 #投資初心者 #マネー #資産運用 #FX初心者 #トレード #チャート分析 #副業

---

## 【LINEパターン】

こんにちは！秋田です😊

今日は短いですが、大事なことを一つだけお伝えします。

「トレードで迷ったら、休む」

これが秋田式の鉄則のひとつです。

相場は逃げません。無理にエントリーして負けるより、次のチャンスを待つ方が絶対に正解です。

ぜひ今日から実践してみてください！

また明日😊`,

  email: `## 【件名】
- 「FXで月3万円を達成した会社員が教える、たった1つの習慣」
- 「なぜあなたのFXは勝てないのか？原因は〇〇にありました」

## 【プレヘッダーテキスト】
秋田式メソッドで変わった3,000人の共通点とは

---

## 【本文】

〇〇さん、こんにちは。秋田です。

突然ですが、こんな経験はありませんか？

「FXの勉強はしているのに、なぜか勝てない」
「利益が出ても、すぐに吹き飛んでしまう」
「そもそも何が悪いのかわからない」

私も最初の2年間、まったく同じ状態でした。

---

転機は、ある「シンプルな法則」に気づいたときです。

それは**「相場の流れを3つの時間軸で確認する」**こと。

これだけで、私のトレード勝率は38%から67%に上がりました。

難しいインジケーターは一切使いません。ローソク足と移動平均線だけです。

---

この手法を体系化したのが「秋田式メソッド」です。

現在3,000名以上の方に実践いただき、多くの方から「初めて月プラスになった」との声をいただいています。

---

今なら、無料で詳細な解説動画をご覧いただけます。

▼ 無料で視聴する
https://example.com/free-video

---

## 【追伸（P.S.）】
この動画は予告なく終了する場合があります。「あのとき見ておけば…」とならないよう、今すぐご確認ください。`,

  seminar: `---スライド1---
【タイトル】
秋田式メソッド FX実践セミナー〜安定収益を生む3つの法則〜

【ポイント】
・本日の登壇者：秋田（peace-method 代表）
・受講者実績：3,000名以上
・所要時間：90分

【スピーカーノート】
まず自己紹介と本日のアジェンダをお伝えする。参加者の緊張をほぐすため、最初は軽いジョークを入れても良い。
---

---スライド2---
【タイトル】
なぜFXで9割の人が負けるのか？

【ポイント】
・感情に支配されたトレード
・根拠のないエントリー
・リスク管理の欠如

【スピーカーノート】
参加者に「負けた経験があるか」を挙手で確認する。共感を生むことでセミナーへの集中度が上がる。
---

---スライド3---
【タイトル】
秋田式メソッド 3つの法則

【ポイント】
・法則1：トレンドフォロー（流れに乗る）
・法則2：マルチタイムフレーム分析（精度を高める）
・法則3：リスク管理の徹底（資金を守る）

【スピーカーノート】
各法則を順番に詳しく解説する。チャートの実例を見せながら説明するとより効果的。
---

---スライド4---
【タイトル】
まとめ・次のステップ

【ポイント】
・今日学んだ3つの法則を明日から実践する
・無料コミュニティへの参加で継続サポート
・個別相談は概要欄のリンクから

【スピーカーノート】
行動を促すため、具体的な「次の一歩」を明示する。無料コミュニティへの誘導を忘れずに。
---`
};

app.post('/api/convert', async (req, res) => {
  const { content, format, tone, length, apiKey: clientKey, detailInstruction = {} } = req.body;

  // サーバー環境変数のキーを優先、なければクライアント提供のキーを使用
  const apiKey = process.env.ANTHROPIC_API_KEY || clientKey;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'コンテンツを入力してください。' });
  }
  if (!format || !SYSTEM_PROMPTS[format]) {
    return res.status(400).json({ error: '変換フォーマットを選択してください。' });
  }

  // モックモード（APIキーが "mock" または未設定の場合）
  if (!apiKey || apiKey === 'mock') {
    await new Promise(r => setTimeout(r, 1500)); // 処理感を出すための待機
    return res.json({
      result: MOCK_RESPONSES[format],
      usage: { input_tokens: 0, output_tokens: 0 },
      mock: true
    });
  }

  const lengthText = LENGTH_MODIFIERS[format]?.[length] || '';

  // 詳細指示をプロンプトに組み込む
  const detailLines = [];
  if (detailInstruction.targetAudience)
    detailLines.push(`【ターゲット読者】${detailInstruction.targetAudience}`);
  if (detailInstruction.emphasisPoints)
    detailLines.push(`【特に強調すること】${detailInstruction.emphasisPoints}`);
  if (detailInstruction.excludePoints)
    detailLines.push(`【省略・除外すること】${detailInstruction.excludePoints}`);
  if (detailInstruction.keywords)
    detailLines.push(`【必ず含めるキーワード】${detailInstruction.keywords}`);
  if (detailInstruction.customInstruction)
    detailLines.push(`【追加指示】\n${detailInstruction.customInstruction}`);
  const detailText = detailLines.length > 0
    ? '以下の指示を必ず守って出力してください：\n' + detailLines.join('\n')
    : '';

  const systemPrompt = [
    SYSTEM_PROMPTS[format],
    tone && TONE_MODIFIERS[tone] ? TONE_MODIFIERS[tone] : '',
    lengthText,
    detailText
  ].filter(Boolean).join('\n\n');

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `以下のコンテンツを変換してください：\n\n${content}`
          }
        ]
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 120000
      }
    );

    const result = response.data.content[0].text;
    res.json({ result, usage: response.data.usage });

  } catch (error) {
    console.error('Claude API error:', error.response?.data || error.message);

    if (error.response) {
      const status = error.response.status;
      const errData = error.response.data;

      if (status === 401) {
        return res.status(401).json({ error: 'APIキーが無効です。正しいAPIキーを入力してください。' });
      } else if (status === 429) {
        return res.status(429).json({ error: 'APIの利用制限に達しました。しばらく待ってから再試行してください。' });
      } else if (status === 400) {
        return res.status(400).json({ error: `リクエストエラー: ${errData?.error?.message || '不明なエラー'}` });
      } else {
        return res.status(status).json({ error: `APIエラー (${status}): ${errData?.error?.message || '不明なエラー'}` });
      }
    }

    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'APIリクエストがタイムアウトしました。再試行してください。' });
    }

    res.status(500).json({ error: `サーバーエラーが発生しました: ${error.message}` });
  }
});

// ─── URL fetch endpoint ───
// ISBNからOpenBD APIで書籍情報を取得
async function fetchBookByIsbn(isbn) {
  const clean = isbn.replace(/[-\s]/g, '');
  const res = await axios.get(`https://api.openbd.jp/v1/get?isbn=${clean}`, { timeout: 10000 });
  const book = res.data?.[0];
  if (!book) return null;

  const summary = book.summary || {};
  const onix = book.onix || {};
  const desc = onix.CollateralDetail?.TextContent?.[0]?.Text || '';
  const toc  = onix.CollateralDetail?.TextContent?.find(t => t.TextType === '04')?.Text || '';
  const author = summary.author || '';
  const title  = summary.title  || '';
  const publisher = summary.publisher || '';
  const pubdate   = summary.pubdate   || '';

  const lines = [
    `【書籍タイトル】${title}`,
    author    ? `【著者】${author}` : '',
    publisher ? `【出版社】${publisher}` : '',
    pubdate   ? `【出版日】${pubdate}` : '',
    desc      ? `\n【内容紹介】\n${desc}` : '',
    toc       ? `\n【目次】\n${toc}` : '',
  ].filter(Boolean).join('\n');

  return { text: lines, title: title || `ISBN ${clean}` };
}

app.post('/api/fetch-url', async (req, res) => {
  const { url, startPage, endPage } = req.body;
  if (!url) return res.status(400).json({ error: 'URLを入力してください。' });

  try {
    // ISBN直接入力（13桁 or 10桁、ハイフンあり/なし）
    const isbnDirect = url.trim().replace(/[-\s]/g, '');
    if (/^(97[89])?\d{9}[\dX]$/.test(isbnDirect)) {
      const book = await fetchBookByIsbn(isbnDirect);
      if (!book) return res.status(422).json({ error: '書籍情報が見つかりませんでした。ISBNを確認してください。' });
      return res.json({ ...book, type: 'book' });
    }

    // AmazonのURLからASIN/ISBNを抽出
    const amazonMatch = url.match(/amazon\.co\.jp(?:\/.*)?\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    if (amazonMatch) {
      const asin = amazonMatch[1];
      // ASINが数字のみ＝ISBN-10の可能性が高い
      if (/^\d{10}$/.test(asin) || /^\d{9}[\dX]$/.test(asin)) {
        const book = await fetchBookByIsbn(asin);
        if (book) return res.json({ ...book, type: 'book' });
      }
      // ISBNで取得できなかった場合はWebスクレイピングへフォールスルー
    }

    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (ytMatch) {
      const videoId = ytMatch[1].split('?')[0];
      try {
        const text = await fetchYouTubeTranscript(videoId);
        if (!text) return res.status(422).json({ error: 'この動画には字幕がありません。自動生成字幕も含めて字幕が設定されている動画のURLを入力してください。' });
        return res.json({ text, type: 'youtube', title: `YouTube動画 (${videoId})` });
      } catch (ytErr) {
        return res.status(422).json({ error: `YouTube字幕の取得に失敗しました: ${ytErr.message}` });
      }
    }

    // まずヘッダーだけ取得してContent-Typeを確認
    const headRes = await axios.get(url, {
      timeout: 15000,
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const contentType = headRes.headers['content-type'] || '';
    const buf = Buffer.from(headRes.data);

    // PDF判定：Content-TypeまたはURLの拡張子またはマジックバイト(%PDF)
    const isPdf = contentType.includes('application/pdf')
      || url.toLowerCase().includes('.pdf')
      || buf.slice(0, 5).toString('ascii') === '%PDF-';

    if (isPdf) {
      try {
        const start = parseInt(startPage) || null;
        const end   = parseInt(endPage)   || null;

        const options = {};
        if (start || end) {
          const s = start || 1;
          const e = end   || Infinity;
          options.pagerender = async (pageData) => {
            const pageNum = pageData.pageIndex + 1;
            if (pageNum < s || pageNum > e) return '';
            const content = await pageData.getTextContent();
            return content.items.map(i => i.str).join(' ') + '\n';
          };
          if (end) options.max = end;
        }

        const data = await pdfParse(buf, options);
        const totalPages = data.numpages;

        // 文字化け行を除去：日本語・英数字・基本記号以外が多い行をフィルター
        const cleanLines = data.text.split('\n').filter(line => {
          if (line.trim() === '') return true;
          // 日本語（ひらがな・カタカナ・漢字）・英数字・基本記号の文字数を数える
          const validChars = (line.match(/[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u0020-\u007E]/g) || []).length;
          const ratio = validChars / line.length;
          return ratio > 0.5; // 半分以上が有効文字なら残す
        });
        let text = cleanLines.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        if (!text) return res.status(422).json({ error: 'PDFからテキストを取得できませんでした。スキャンPDFや画像PDFは非対応です。' });

        const rangeLabel = (start || end)
          ? `（${start || 1}〜${end || totalPages}ページ）`
          : `（全${totalPages}ページ）`;
        const truncated = text.length > 50000
          ? text.slice(0, 50000) + '\n\n[※長いため途中で切り取りました]'
          : text;
        const pdfName = url.split('/').pop().split('?')[0] || 'document';
        return res.json({
          text: truncated,
          type: 'pdf',
          title: `${pdfName} ${rangeLabel}`,
          totalPages
        });
      } catch (e) {
        return res.status(422).json({ error: 'PDFの解析に失敗しました: ' + e.message });
      }
    }

    // Webpage
    let charset = 'utf-8';
    const ctMatch = contentType.match(/charset=([^\s;]+)/i);
    if (ctMatch) {
      charset = ctMatch[1].toLowerCase().replace('_', '-');
    } else {
      // HTMLのmetaタグからcharsetを検出
      const raw = buf.slice(0, 2048).toString('binary');
      const metaMatch = raw.match(/charset=["']?([^"';\s>]+)/i);
      if (metaMatch) charset = metaMatch[1].toLowerCase().replace('_', '-');
    }
    // Shift-JIS系の表記を統一
    if (['shift-jis', 'shift_jis', 'sjis', 'x-sjis', 'windows-31j', 'cp932'].includes(charset)) {
      charset = 'Shift_JIS';
    } else if (['euc-jp', 'euc_jp', 'x-euc-jp'].includes(charset)) {
      charset = 'EUC-JP';
    }

    const html = iconv.decode(buf, charset);
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, .header, .footer, .nav, .menu, .sidebar, iframe, noscript').remove();
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Webページ';
    let text = '';
    const mainSelectors = ['main', 'article', '.content', '#content', '.main', '#main', '.post', '.entry'];
    for (const sel of mainSelectors) {
      if ($(sel).length) { text = $(sel).text(); break; }
    }
    if (!text) text = $('body').text();
    text = text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 30000) text = text.slice(0, 30000) + '\n\n[※長いため途中で切り取りました]';
    if (!text) return res.status(422).json({ error: 'ページからテキストを取得できませんでした。' });
    return res.json({ text, type: 'web', title });

  } catch (error) {
    if (error.code === 'ECONNABORTED') return res.status(504).json({ error: 'タイムアウトしました。URLを確認してください。' });
    if (error.response?.status === 403) return res.status(403).json({ error: 'アクセスが拒否されました（403）。このサイトは直接取得できません。' });
    if (error.response?.status === 404) return res.status(404).json({ error: 'ページが見つかりません（404）。' });
    return res.status(500).json({ error: `取得エラー: ${error.message}` });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'コンテンツ変換スタジオ サーバー稼働中' });
});

// フロントエンドにサーバー設定を返す
app.get('/api/config', (req, res) => {
  res.json({ serverKeyConfigured: !!process.env.ANTHROPIC_API_KEY });
});

app.listen(PORT, () => {
  console.log(`\n✅ コンテンツ変換スタジオ サーバー起動中`);
  console.log(`📡 http://localhost:${PORT}`);
  console.log(`\nブラウザで http://localhost:${PORT} を開いてください\n`);
});
