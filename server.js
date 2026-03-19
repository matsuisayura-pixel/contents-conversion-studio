const express = require('express');
const cors = require('cors');
const axios = require('axios');

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

const LENGTH_MODIFIERS = {
  short: '簡潔にまとめ、短めのボリューム（500〜800文字程度）で書いてください。',
  medium: '適度なボリューム（1000〜1500文字程度）で、必要な情報を網羅してください。',
  long: '詳細に書き、十分なボリューム（2000〜3000文字程度）で丁寧に解説してください。'
};

app.post('/api/convert', async (req, res) => {
  const { content, format, tone, length, apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'APIキーが必要です。' });
  }
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'コンテンツを入力してください。' });
  }
  if (!format || !SYSTEM_PROMPTS[format]) {
    return res.status(400).json({ error: '変換フォーマットを選択してください。' });
  }

  const systemPrompt = [
    SYSTEM_PROMPTS[format],
    tone && TONE_MODIFIERS[tone] ? TONE_MODIFIERS[tone] : '',
    length && LENGTH_MODIFIERS[length] ? LENGTH_MODIFIERS[length] : ''
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'コンテンツ変換スタジオ サーバー稼働中' });
});

app.listen(PORT, () => {
  console.log(`\n✅ コンテンツ変換スタジオ サーバー起動中`);
  console.log(`📡 http://localhost:${PORT}`);
  console.log(`\nブラウザで http://localhost:${PORT} を開いてください\n`);
});
