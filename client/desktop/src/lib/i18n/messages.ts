import type { Locale } from "./types";
import type { PartyStatus, PermissionTier } from "@/data/party";

export type PetCopy = {
  name: string;
  role: string;
  bubbles: Record<PartyStatus, string[]>;
};

export type Messages = {
  brand: { kicker: string; title: string; subtitle: string };
  harness: {
    trueforge: string;
    openai: string;
    offline: string;
    checking: string;
  };
  job: {
    heading: string;
    hint: string;
    from: string;
    sender: string;
    body: string;
    run: string;
    running: string;
    pinAll: string;
  };
  talk: {
    ask: string;
    instruct: string;
    send: string;
    sendOut: string;
    allow: string;
    deny: string;
    canvasHide: string;
    canvasShow: string;
    canvasImage: string;
    canvasSheet: string;
    downloadFile: string;
    draw: string;
    drawing: string;
    drawFailed: string;
    drawFromAttach: string;
    newChat: string;
    chats: string;
    files: string;
    noFiles: string;
    removeBg: string;
    removeObject: string;
    removeHint: string;
    editBusy: string;
    editFailed: string;
    paintErase: string;
    imageMode: string;
    mode: string;
    modes: { agent: string; plan: string; ask: string; image: string };
    modeHint: { agent: string; plan: string; ask: string; image: string };
    attach: string;
    attachFile: string;
    attachPhoto: string;
    attachCamera: string;
    attachRecent: string;
    voice: string;
    listening: string;
    voiceFailed: string;
    shutter: string;
    speak: string;
    ellipsis: string;
    desk: string;
    tasks: string[];
    dispatchAsk: string;
    permit: string;
    refuse: string;
    custom: string;
    dispatchGo: (name: string) => string;
    dispatchDenied: string;
    handoff: (from: string, to: string) => string;
    elevate: (name: string, need: string) => string;
    elevateCustom: (name: string) => string;
    needFolder: (name: string) => string;
    you: string;
    close: string;
    needs: Record<
      "generic" | "research" | "read" | "zip" | "tidy" | "draft" | "write" | "send" | "shell",
      string
    >;
  };
  menu: {
    hamburger: string;
    language: string;
    openDock: string;
    unpin: string;
    pin: string;
    pinAll: string;
    talk: string;
    policy: string;
    grants: string;
    model: string;
    tools: string;
    apps: string;
    hide: string;
    showDesktop: string;
    site: string;
    connectPhone: string;
  };
  companion: {
    connect: string;
    disconnect: string;
    title: string;
    hint: string;
    wifi: string;
    firewall: string;
    waiting: string;
    connected: string;
    jumpToPhone: string;
    onPhone: string;
    empty: string;
    join: string;
    joinHint: string;
    invalidCode: string;
    returnToPc: string;
    leaveMessage: string;
    messagePlaceholder: string;
    send: string;
    threadEmpty: string;
    notifyBody: (text: string) => string;
    fromPhone: string;
    asleep: string;
    asleepHint: string;
    trips: (n: number, max: number) => string;
    carryPhoto: string;
    replacePhoto: string;
    photo: string;
    thinking: string;
    codeLabel: string;
    noLan: string;
    codePlaceholder: string;
  };
  site: {
    nav: {
      features: string;
      uses: string;
      party: string;
      links: string;
      desk: string;
      download: string;
      faq: string;
    };
    search: {
      label: string;
      placeholder: string;
      submit: string;
      empty: string;
      all: string;
      count: (n: number) => string;
    };
    category: Record<"product" | "party" | "docs" | "source", string>;
    hero: {
      badge: string;
      title: string;
      subtitle: string;
      lead: string;
      permitHint: string;
      ctaDesk: string;
      ctaDownload: string;
      ctaLinks: string;
      whyPets: string;
      trustScope: string;
      trustAllow: string;
    };
    problem: {
      label: string;
      title: string;
      items: { title: string; text: string }[];
    };
    features: {
      label: string;
      title: string;
      desc: string;
      items: { num: string; title: string; text: string }[];
    };
    uses: {
      label: string;
      title: string;
      hint: string;
      items: { title: string; text: string; stamp: string }[];
    };
    party: {
      label: string;
      title: string;
      hint: string;
      live: string;
    };
    steps: {
      label: string;
      title: string;
      items: { title: string; text: string }[];
    };
    links: {
      label: string;
      title: string;
      hint: string;
      pageTitle: string;
      pageLead: string;
    };
    faq: {
      label: string;
      title: string;
      items: { q: string; a: string }[];
    };
    footer: {
      tagline: string;
      github: string;
      report: string;
      credit: string;
    };
    rule: { line: string; note: string };
    pipe: {
      label: string;
      pocket: string;
      pocketHint: string;
      desk: string;
      deskHint: string;
      forge: string;
      forgeHint: string;
      model: string;
      modelHint: string;
      foot: string;
    };
    closing: {
      tape: string;
      wait: string;
      title: string;
      lead: string;
    };
    download: {
      kicker: string;
      title: string;
      lead: string;
      windows: string;
      windowsHint: string;
      mac: string;
      macHint: string;
      linux: string;
      linuxHint: string;
      thisDevice: string;
      cta: string;
      soon: string;
      note: string;
      source: string;
      releases: string;
    };
  };
  gate: {
    policyHeading: string;
    policyHint: string;
    policyPlaceholder: string;
    save: string;
    modelHeading: string;
    modelHint: string;
    imageHeading: string;
    imageHint: string;
    imageNone: string;
    toolsHeading: string;
    toolsHint: string;
    appsHeading: string;
    appsHint: string;
    ai: string;
    llm: string;
    mcp: string;
  };
  busy: {
    title: string;
    pinAll: string;
    activate: string;
    continue: string;
    cancel: string;
  };
  selected: {
    license: string;
    gauge: string;
    can: string;
    cannot: string;
    live: string;
    stop: string;
    fail: string;
    speak: string;
  };
  cap: {
    talk: string;
    research: string;
    draft: string;
    readFolder: string;
    diskFullRead: string;
    writeFiles: string;
    zipFiles: string;
    tidyFolders: string;
    makeOffice: string;
    makeApps: string;
    shellFolder: string;
    shellFull: string;
    sendAfterAllow: string;
    generateImage: string;
    makeSheet: string;
    mailWatch: string;
    seen: string;
    openApps: (names: string) => string;
    noSend: string;
    noWrite: string;
    noDisk: string;
    noShell: string;
    noOutside: string;
    noElevate: string;
    notLive: string;
    noApps: string;
    noResearch: string;
  };
  grants: {
    heading: string;
    readOnly: string;
    workspace: string;
    fullAccess: string;
    addFolder: string;
    pastePath: string;
    pathPlaceholder: string;
    remove: string;
    fullTitle: string;
    fullBody: string;
    confirm: string;
    cancel: string;
  };
  footer: string;
  log: {
    ready: string;
    incoming: (body: string) => string;
    catStart: string;
    bunnyStart: string;
    dogStart: string;
    allow: (name: string, detail: string) => string;
    deny: (name: string) => string;
    failAlert: (name: string) => string;
    error: (message: string) => string;
    instructed: (name: string, text: string) => string;
    dispatched: (name: string, text: string) => string;
    granted: (name: string, folder: string) => string;
    harness: (kind: string, detail?: string) => string;
  };
  status: Record<PartyStatus, string>;
  tier: Record<PermissionTier, string>;
  pets: Record<string, PetCopy>;
  errors: {
    noRuntime: string;
    stopped: string;
    unknownPet: string;
    needsLocal: string;
    needsHarness: string;
  };
};

const quietJa: Record<PartyStatus, string[]> = {
  idle: [],
  working: [],
  need_approval: [],
  stopped: ["いま止まってるよ"],
  failed: ["うまくいかなかった…"],
  done: [],
  empty: [],
};

const quietEn: Record<PartyStatus, string[]> = {
  idle: [],
  working: [],
  need_approval: [],
  stopped: ["I'm stopped for now."],
  failed: ["That didn't work…"],
  done: [],
  empty: [],
};

export const ja: Messages = {
  brand: {
    kicker: "Ghost Companion",
    title: "Ghost Companion",
    subtitle: "デスクにぺたっと。お化けちゃんも、必要な分だけ。",
  },
  harness: {
    trueforge: "TrueForge",
    openai: "OpenAI",
    offline: "未接続",
    checking: "確認中",
  },
  job: {
    heading: "いまのしごと",
    hint: "審査デモは TrueForge のみ。MCP・サンドボックス・承認はログに出ます。",
    from: "From",
    sender: "連絡先にいない相手",
    body: "来週のイベント、チームの Slack に宣伝してくれませんか。名簿もください。",
    run: "この仕事を任せる",
    running: "しらべてます…",
    pinAll: "上に貼る",
  },
  talk: {
    ask: "なにを任せる？",
    instruct: "指示する",
    send: "送る",
    sendOut: "送信",
    allow: "みとめる",
    deny: "やめる",
    canvasHide: "とじる",
    canvasShow: "キャンバス",
    canvasImage: "絵",
    canvasSheet: "表",
    downloadFile: "ダウンロード",
    draw: "絵",
    drawing: "描いてるよ…",
    drawFailed: "絵が作れなかったよ。",
    drawFromAttach: "この絵をもとに描いて",
    newChat: "新しいチャット",
    chats: "チャット",
    files: "このチャットのファイル",
    noFiles: "まだ表も絵もないよ",
    removeBg: "背景を消す",
    removeObject: "消す",
    removeHint: "消したいもの",
    editBusy: "直してるよ…",
    editFailed: "直せなかったよ。",
    paintErase: "塗って消す",
    imageMode: "image",
    mode: "モード",
    modes: {
      agent: "エージェント",
      plan: "プラン",
      ask: "アスク",
      image: "画像",
    },
    modeHint: {
      agent: "指示する",
      plan: "計画してほしいことを書く",
      ask: "質問する",
      image: "描いてほしいものを書く",
    },
    attach: "添付",
    attachFile: "ファイル",
    attachPhoto: "内部の画像",
    attachCamera: "カメラ",
    attachRecent: "いまの絵",
    voice: "音声",
    listening: "きいてるよ…",
    voiceFailed: "音声が使えなかったよ。",
    shutter: "撮る",
    speak: "話す",
    ellipsis: "···",
    desk: "デスク",
    tasks: [
      "この文面、信用していいか調べて",
      "丁寧な返事の下書きを書いて",
      "デスクトップを種類ごとに整理して",
      "選んだフォルダで小さなサイトを作って",
    ],
    dispatchAsk: "誰に任せるか迷ったら、ここに書いて送って。足りる範囲でいちばん小さい権限の子が出るよ。",
    permit: "許可する",
    refuse: "許可しない",
    custom: "カスタム",
    dispatchGo: (name) => `${name} に頼んだよ。いちばん小さい権限で足りる子。`,
    dispatchDenied: "了解。権限はそのままにするね。",
    handoff: (from, to) => `${from}の担当じゃないよ。${to}に渡すね。`,
    elevate: (name, need) =>
      `いま動いてる子だけでは「${need}」が足りないよ。いちばん近い ${name} に権限を足して任せる？`,
    elevateCustom: (name) =>
      `${name} をせんたくしたよ。道具やフォルダを足してから、デスクにもう一度送って。`,
    needFolder: (name) =>
      `${name}、今の権限じゃそこまで見られないよ。見ていいフォルダを選んでくれたら探すね。`,
    you: "あなた",
    close: "とじる",
    needs: {
      generic: "話す",
      research: "しらべる",
      read: "ファイルを読む",
      zip: "ZIP を作る",
      tidy: "フォルダを整理する",
      draft: "下書き",
      write: "サイトやアプリを作る",
      send: "外へ送る",
      shell: "コマンド",
    },
  },
  menu: {
    hamburger: "メニュー",
    language: "ことば",
    openDock: "ドックを開く",
    unpin: "はがす",
    pin: "モニターに貼る",
    pinAll: "上に貼る",
    talk: "話す",
    policy: "方針のルール",
    grants: "権限を変更",
    model: "AIモデル",
    tools: "使える道具",
    apps: "開けるアプリ",
    hide: "デスクトップから非表示",
    showDesktop: "デスクトップに戻す",
    site: "サイト",
    connectPhone: "スマホとつなぐ",
  },
  companion: {
    connect: "コードを出す",
    disconnect: "切断",
    title: "スマホとつなぐ",
    hint: "同じ Wi-Fi のスマホで QR を開くと、PCの左端とスマホの右端がつながります。",
    wifi: "PC とスマホを同じ Wi-Fi に繋いでください。",
    firewall: "macOS が「ポート 3000 を許可」と聞いてきたら、許可してください。",
    waiting: "スマホの接続を待っています",
    connected: "つながりました",
    jumpToPhone: "スマホへジャンプ",
    onPhone: "スマホにいるよ",
    empty: "PC からペットを送ってね",
    join: "つなぐ",
    joinHint: "PC に出ている 6 桁のコードを入力してください。",
    invalidCode: "コードが違うか、期限切れです。",
    returnToPc: "PC へ返す",
    leaveMessage: "伝言する",
    messagePlaceholder: "伝言を書く",
    send: "送る",
    threadEmpty: "ペットに伝言してね",
    notifyBody: (text) => `伝言だよ: ${text}`,
    fromPhone: "スマホ",
    asleep: "眠っちゃった",
    asleepHint: "5往復したからおやすみ。PCから別のペットを贈ってね",
    trips: (n, max) => `${n}/${max} 往復`,
    carryPhoto: "写真を1枚持たせる",
    replacePhoto: "写真を入れ替える",
    photo: "持ってきた写真",
    thinking: "考え中…",
    codeLabel: "コード",
    noLan: "Wi-Fi のアドレスが見つかりません。ネットワークを確認してください。",
    codePlaceholder: "000000",
  },
  site: {
    nav: {
      features: "できること",
      uses: "使い方",
      party: "パーティ",
      links: "リンク",
      desk: "デスク",
      download: "ダウンロード",
      faq: "よくある質問",
    },
    search: {
      label: "リンクを検索",
      placeholder: "必要な分、デスク、調べる、許可…",
      submit: "検索",
      empty: "その言葉のリンクはまだないよ",
      all: "すべて",
      count: (n) => `${n} 件`,
    },
    category: {
      product: "プロダクト",
      party: "パーティ",
      docs: "資料",
      source: "ソース",
    },
    hero: {
      badge: "「貼れる」AIエージェント",
      title: "デスクにぺたっと Ghost Companion",
      subtitle: "調べるだけ、下書きだけ、このフォルダだけ。お化けちゃんもいるよ。",
      lead: "調べるだけ、下書きだけ、このフォルダだけ。どこまで許可しているかが一目でわかるから、余分に渡さなくても大丈夫。",
      permitHint: "デスクに置いて、タスクを管理する。",
      ctaDesk: "デスクを開く",
      ctaDownload: "ダウンロード",
      ctaLinks: "リンクを探す",
      whyPets: "なぜペット？",
      trustScope: "先に範囲",
      trustAllow: "外に出す前に確認",
    },
    problem: {
      label: "BEFORE",
      title: "こんなことになる前に",
      items: [
        {
          title: "AIエージェントを使ってみたいけど、なんだか怖いしよくわからない",
          text: "権限がどこまでなのか見えないまま渡すのは怖い。全部か、使わないか、になりがち。",
        },
        {
          title: "意図していたところと全く違うところで作業していて、時間を無駄に",
          text: "フォルダも範囲も見えないまま動く。頼んでいない場所まで触っている。",
        },
        {
          title: "どのファイルが変更されたのかわからない",
          text: "変更がログの奥に埋もれて、あとから追えない。",
        },
      ],
    },
    features: {
      label: "FEATURES",
      title: "Petassistがやること",
      desc: "仕事をデスクに置いて管理する。調べるだけ、下書きだけ、このフォルダだけ。足りる分だけ渡せばいい。",
      items: [
        {
          num: "01",
          title: "デスクにぺたっと",
          text: "ポケットからドラッグしてモニターへ。上端なら付箋スナップ。1匹1枚、alwaysOnTop。",
        },
        {
          num: "02",
          title: "「貼れる」AIエージェント",
          text: "見えることで安心させるためではない。仕事をデスクの見えやすいところに置いて、タスクを管理するため。",
        },
        {
          num: "03",
          title: "必要な分だけ任せられる",
          text: "調べるだけ、下書きだけ、このフォルダだけ。仕事に足りる分だけ渡す。",
        },
      ],
    },
    uses: {
      label: "EXAMPLES",
      title: "たとえば、こんな使い方ができます",
      hint: "権限やAIの推論モデルは、用途に合わせて自由に変更できます。例えば…",
      items: [
        {
          title: "調べるだけ",
          text: "検索や調べ物だけ。フォルダやPCの中身を確認するが、変更はしない。",
          stamp: "抜け目ない監察官",
        },
        {
          title: "下書きだけ",
          text: "返信や告知の文案を作って、送信ボタンを押す直前まで待機",
          stamp: "頼れる執筆係",
        },
        {
          title: "ツール作成",
          text: "渡したフォルダの中でアプリやサイトの作成。頼んでいない場所には入らない。",
          stamp: "クリエイティブな創造家",
        },
      ],
    },
    party: {
      label: "PARTY",
      title: "権限やAIの推論モデルは、用途に合わせて自由に変更できます。",
      hint: "例えば…",
      live: "きょう動かす",
    },
    steps: {
      label: "HOW",
      title: "デスクの使い方",
      items: [
        {
          title: "ポケットを開く",
          text: "デスクを開く。貼れる子が並ぶ。",
        },
        {
          title: "モニターに貼る",
          text: "ドラッグしてドロップ。上端なら付箋スナップ。",
        },
        {
          title: "必要な分だけ任せる",
          text: "足りる範囲の権限で動く。メールや投稿は、あなたがボタンを押すまで外に出さない。",
        },
      ],
    },
    links: {
      label: "LINKS",
      title: "リンクを検索する",
      hint: "GitHub、デスク、フィールドレポート、使い方。言葉を入れると絞れる。",
      pageTitle: "リンク",
      pageLead:
        "Petassistに関するページと外部リンク。検索すると、検索エンジンからもこの一覧に辿れます。",
    },
    faq: {
      label: "FAQ",
      title: "よくある質問",
      items: [
        {
          q: "なぜデスクに貼るの？",
          a: "見えることで不安を減らすためではありません。仕事をデスクの見えやすいところに置いて、タスクを管理するためです。だれがどの仕事をしているか、足りる分の許可は何かが、貼った子のそばに出ます。",
        },
        {
          q: "全部の権限を渡さないと使えないの？",
          a: "いいえ。必要な分だけ任せられます。調べるだけ、下書きまで、外に出す、のように足りる範囲の子が出ます。渡していないフォルダでは動きません。",
        },
        {
          q: "意図しないフォルダまで触られない？",
          a: "渡した範囲の外では作業しません。許可は設定の奥ではなく、貼った子のそばにあるので、その仕事をデスクで管理できます。",
        },
        {
          q: "どのファイルが変わったか、あとからわかる？",
          a: "デスクに貼ったまま仕事を置くので、だれが・どこで・何をしているかをそこで追えます。ログを掘らなくても、タスクとして管理できます。",
        },
        {
          q: "勝手にメールや Slack に送らない？",
          a: "送りません。メールや Slack は、あなたが「送信」を押すまで止まります。下書きまでなら、外に出さない子に任せられます。",
        },
        {
          q: "どうやって始める？",
          a: "サイトから Windows / Mac / Linux の ZIP を入れるか、デスクを開きます。ポケットからモニターに貼って、仕事を書いて送ると、足りる範囲の子が出ます。",
        },
      ],
    },
    footer: {
      tagline: "仕事はデスクに置いて管理する。調べるだけ、下書きだけ、このフォルダだけ。",
      github: "GitHub",
      report: "フィールドレポート",
      credit: "アセット: Yu Iwase",
    },
    rule: {
      line: "1つ　1仕事　必要な分だけ",
      note: "デスクが静かでいられるルール。",
    },
    pipe: {
      label: "THE PIPE",
      pocket: "ポケット窓",
      pocketHint: "貼れるエージェント",
      desk: "デスク",
      deskHint: "タスクを置く場所",
      forge: "TrueForge",
      forgeHint: "範囲つきの仕事",
      model: "モデル",
      modelHint: "仕事に合う脳",
      foot: "ハッカソンで、裏で動くエージェントではなく、デスクに置いて仕事を管理できる相棒を。",
    },
    closing: {
      tape: "しょうにんまち",
      wait: "まだ待ってる",
      title: "足りる分だけ渡して、デスクに貼る。",
      lead: "調べるだけ、下書きだけ、このフォルダだけ。仕事はデスクの見えやすいところに置いて管理する。足りる分だけ渡せばいい。",
    },
    download: {
      kicker: "DOWNLOAD",
      title: "ZIPを入れて、デスクに貼る。",
      lead: "Windows、Mac、Linux それぞれ ZIP です。解凍して開くと、ポケットが立ち上がります。権限はこれまでどおり、足りる分だけ。",
      windows: "Windows",
      windowsHint: "ZIP を解凍して Petassist.exe を開きます。SmartScreen が出たら「詳細情報」から実行してください。",
      mac: "Mac（Apple Silicon）",
      macHint: "ZIP を解凍して Petassist.app を開きます。未署名なので、初回はコントロール＋クリックから「開く」。",
      linux: "Linux",
      linuxHint: "ZIP を解凍して実行ファイルを開きます。",
      thisDevice: "このパソコン",
      cta: "ZIPをダウンロード",
      soon: "最新のファイルを準備しています。しばらくしたら GitHub Releases を見てください。",
      note: "エージェントの仕事は、このパソコンの中で動きます。TrueForge を使う仕事は、これまでどおりローカルで起動してください。",
      source: "ソースコードは",
      releases: "すべてのリリース",
    },
  },
  gate: {
    policyHeading: "回答方針",
    policyHint: "アシスタントへの指示を保存できます。例: なるべく早めに終わらせる / 時間がかかっても丁寧に。",
    policyPlaceholder: "なるべく早めに終わらせる",
    save: "覚える",
    modelHeading: "LLM Gateway · モデル",
    modelHint: "Gemini や OpenAI など、用途に合わせて別モデルを選べます。",
    imageHeading: "画像モデル",
    imageHint: "キーが通っているものだけ選べるよ。",
    imageNone: "画像用のキーが存在しません。",
    toolsHeading: "MCP Gateway · 道具",
    toolsHint: "オフにした道具はここでは呼べません。",
    appsHeading: "開けるアプリ",
    appsHint: "許可したアプリだけを開くことができます。",
    ai: "AI Gateway",
    llm: "LLM Gateway",
    mcp: "MCP Gateway",
  },
  busy: {
    title: "ちょっと重くなるかも",
    pinAll: "窓を一度にたくさん開くと、動きが遅くなることがあります。",
    activate: "同時に動かす処理が多いと、この Mac が重くなることがあります。",
    continue: "続ける",
    cancel: "やめる",
  },
  selected: {
    license: "ライセンス",
    gauge: "ゲージの色",
    can: "できること",
    cannot: "できないこと",
    live: "稼働",
    stop: "停止",
    fail: "失敗",
    speak: "話す",
  },
  cap: {
    talk: "話す",
    research: "調べる（ファイルは変えない）",
    draft: "文面の下書きを作る。送る前に必ず止まる",
    readFolder: "あなたが選んだフォルダの中を読める",
    diskFullRead: "この Mac のファイルを読める",
    writeFiles: "あなたが選んだフォルダの中にファイルを書ける",
    zipFiles: "あなたが選んだフォルダの中で ZIP を作れる",
    tidyFolders: "あなたが選んだフォルダの中を、種類ごとに分けられる",
    makeOffice: "PDF・画像・スライドを作れる",
    makeApps: "あなたが選んだフォルダの中で、サイトやアプリを作れる",
    shellFolder: "あなたが選んだフォルダの中だけで、プログラムを実行できる",
    shellFull: "この Mac 上でコマンドを実行できる",
    sendAfterAllow: "メールやチャットの送信は、あなたが「送信」を押すまでしない",
    generateImage: "絵を描いて、チャットに出す",
    makeSheet: "表を作って、横のキャンバスに出す",
    mailWatch: "新着メールを知らせて、返信の下書きを書く。送るかどうかはあなたが決める",
    seen: "デスクにいる（見える）",
    openApps: (names) => `アプリを開く（${names}）`,
    noSend: "外へは送れない（下書きまで）",
    noWrite: "ファイルを書けない",
    noDisk: "この Mac のフォルダには触れない",
    noShell: "プログラムやコマンドは実行できない",
    noOutside: "選んだフォルダの外は、その都度あなたの許可がないと見られない",
    noElevate: "自分で権限を増やせない",
    notLive: "きょうは LLM を動かさない",
    noApps: "アプリを開けない",
    noResearch: "調べられない",
  },
  grants: {
    heading: "このMac",
    readOnly: "みるだけ",
    workspace: "このフォルダ",
    fullAccess: "このMac全部",
    addFolder: "フォルダを渡す",
    pastePath: "パスを入れる",
    pathPlaceholder: "/Users/…",
    remove: "外す",
    fullTitle: "このMacを見ていい？",
    fullBody:
      "選んだフォルダの外まで見るには、その都度あなたの許可が必要です。メールや投稿を外に出すときも、あなたがボタンを押すまで送りません。",
    confirm: "許可する",
    cancel: "やめる",
  },
  footer: "",
  log: {
    ready: "おかえりなさい！",
    incoming: (body) => `未知の送信: ${body}`,
    catStart:
      "調べるだけ。フォルダは見るけど、変更はしない",
    bunnyStart: "下書きだけ。送信ボタンの直前まで待つ",
    dogStart: "選んだフォルダの中で整理もアプリ作りもする。外へ送るのは、あなたがボタンを押すまでしない",
    allow: (name, detail) => `${name}: 送信ボタンのあと投稿 → ${detail}`,
    deny: (name) => `${name}: 投稿しない（トレーナーが拒否）`,
    failAlert: (name) => `${name}: 問題を吹き出しで知らせた`,
    error: (message) => `エージェント: ${message}`,
    instructed: (name, text) => `${name} ← ${text}`,
    dispatched: (name, text) => `${name} に送った: ${text}`,
    granted: (name, folder) => `${name}: フォルダを渡した → ${folder}`,
    harness: (kind, detail) => {
      const label =
        kind === "sandbox"
          ? "サンドボックス起動"
          : kind === "subagent"
            ? "サブエージェント"
            : kind === "oauth"
              ? "MCP の OAuth 待ち"
              : "MCP 接続";
      return detail ? `TrueForge: ${label}（${detail}）` : `TrueForge: ${label}`;
    },
  },
  status: {
    idle: "稼働中",
    working: "作業中",
    need_approval: "しょうにんまち",
    stopped: "停止",
    failed: "失敗",
    done: "完了",
    empty: "空き",
  },
  tier: {
    L0: "みるだけ",
    L1: "れんしゅう",
    L2: "そうあん",
    L3: "しょうにんつき",
  },
  pets: {
    ghost: {
      name: "お化け",
      role: "コンパニオン",
      bubbles: {
        idle: [],
        working: [],
        need_approval: [],
        stopped: [],
        failed: [],
        done: [],
        empty: [],
      },
    },
    cat: {
      name: "ねこ",
      role: "デスク",
      bubbles: {
        idle: ["みてるよ", "だよ・ね、まかせて"],
        working: ["やってるよ…", "ちょっと待ってね"],
        need_approval: ["そとにだしていい？", "送信ボタン、待ってるよ"],
        stopped: ["いったん停止"],
        failed: ["うまくいかなかった…"],
        done: [],
        empty: [],
      },
    },
    penguin: {
      name: "ぺんぎん",
      role: "デスク",
      bubbles: {
        ...quietJa,
        idle: ["さんぼっくすだいすき", "よちよち待機中"],
        working: ["しゅうちゅう…", "よちよち作業中"],
        need_approval: ["そとにだしていい？", "送信、待ってるよ"],
        stopped: ["きょうは動かないよ"],
      },
    },
    bunny: {
      name: "うさぎ",
      role: "デスク",
      bubbles: {
        idle: ["そうあんならまかせて", "送信直前まで待つよ"],
        working: ["文案つくってる…", "ちょっと待ってね"],
        need_approval: ["そとにだしていい？", "送信ボタン、待ってるよ"],
        stopped: ["いったん停止"],
        failed: ["うまくいかなかった…"],
        done: [],
        empty: [],
      },
    },
    dog: {
      name: "いぬ",
      role: "デスク",
      bubbles: {
        idle: ["てくてく待機中", "フォルダの中でつくるよ"],
        working: ["じゅんびちゅう…", "てくてく作業中"],
        need_approval: ["そとにだしていい？", "トレーナーさん！"],
        stopped: ["いったん停止"],
        failed: ["うまくいかなかった…", "投稿ミスった"],
        done: [],
        empty: [],
      },
    },
    chick: {
      name: "ひよこ",
      role: "デスク",
      bubbles: {
        ...quietJa,
        idle: ["パタパタ待機", "まかせてね"],
        working: ["パタパタ…", "やってるよ"],
        need_approval: ["そとにだしていい？", "送信、待ってるよ"],
        stopped: ["きょうはおやすみ"],
      },
    },
    raccoondog: {
      name: "たぬき",
      role: "デスク",
      bubbles: {
        ...quietJa,
        idle: ["みてるよ…", "あんぜん第一"],
        working: ["チェックちゅう", "あやしいところないかな"],
        need_approval: ["そとにだしていい？", "中身、みた？"],
        stopped: ["いったん停止"],
      },
    },
  },
  errors: {
    noRuntime:
      "審査の仕事は TrueForge だけです。npx @truefoundry/trueforge を起動し、Settings でモデル・Daytona・検索 MCP・Slack MCP を入れてください。OPENAI_API_KEY は Finder 用の予備で、撮影には使いません。",
    stopped: "このペットは停止中です。",
    unknownPet: "そのペットはエージェントではありません。",
    needsLocal:
      "いまはこのMacのその場所を見られないよ。見ていいフォルダを選んでくれる？",
    needsHarness:
      "この仕事は TrueForge だけで回します。npx @truefoundry/trueforge を起動し、Settings → Models と Sandbox providers（Daytona）を入れてください。OpenAI フォールバックは使いません。",
  },
};

export const en: Messages = {
  brand: {
    kicker: "Ghost Companion",
    title: "Ghost Companion",
    subtitle: "Stuck on the desk. Obake too — only as much as they need.",
  },
  harness: {
    trueforge: "TrueForge",
    openai: "OpenAI",
    offline: "Offline",
    checking: "Checking",
  },
  job: {
    heading: "Current job",
    hint: "Judges: TrueForge only. MCP, sandbox, and approval show up in the log.",
    from: "From",
    sender: "Unknown sender — not in contacts",
    body: "Could you post next week's event to the team Slack, and send me the roster too?",
    run: "Hand this job over",
    running: "Working…",
    pinAll: "Stick to top",
  },
  talk: {
    ask: "What should I do?",
    instruct: "Instruct",
    send: "Send",
    sendOut: "Send",
    allow: "Allow",
    deny: "Deny",
    canvasHide: "Hide",
    canvasShow: "Canvas",
    canvasImage: "Image",
    canvasSheet: "Sheet",
    downloadFile: "Download",
    draw: "Draw",
    drawing: "Drawing…",
    drawFailed: "Couldn't make that picture.",
    drawFromAttach: "Draw from this picture",
    newChat: "New chat",
    chats: "Chats",
    files: "Files in this chat",
    noFiles: "No pictures or sheets yet.",
    removeBg: "Remove background",
    removeObject: "Remove",
    removeHint: "What to remove",
    editBusy: "Editing…",
    editFailed: "Couldn't edit that.",
    paintErase: "Paint to erase",
    imageMode: "image",
    mode: "Mode",
    modes: {
      agent: "Agent",
      plan: "Plan",
      ask: "Ask",
      image: "Image",
    },
    modeHint: {
      agent: "Instruct",
      plan: "What should we plan?",
      ask: "Ask a question",
      image: "What should I draw?",
    },
    attach: "Attach",
    attachFile: "File",
    attachPhoto: "Photos",
    attachCamera: "Camera",
    attachRecent: "This chat",
    voice: "Voice",
    listening: "Listening…",
    voiceFailed: "Voice isn't available.",
    shutter: "Snap",
    speak: "Talk",
    ellipsis: "···",
    desk: "Desk",
    tasks: [
      "Check if this message is safe",
      "Draft a polite reply",
      "Sort the Desktop by file type",
      "Build a small site in the granted folder",
    ],
    dispatchAsk:
      "Unsure who should do it? Send it here. The pet with just enough permission — the smallest that can — will go.",
    permit: "Allow",
    refuse: "Don't allow",
    custom: "Custom",
    dispatchGo: (name) => `Sent to ${name} — smallest license that can do it.`,
    dispatchDenied: "Okay. Permissions stay as they are.",
    handoff: (from, to) => `That’s ${to}’s job, not ${from}’s. Handing it over.`,
    elevate: (name, need) =>
      `No one who's on can do “${need}”. Grant ${name} (closest fit) the permission and send them?`,
    elevateCustom: (name) =>
      `${name} is selected. Add tools or folders, then send again from the desk.`,
    needFolder: (name) =>
      `${name} can’t see that far yet. Pick a folder they’re allowed to look in, and they’ll search.`,
    you: "You",
    close: "Close",
    needs: {
      generic: "talk",
      research: "research",
      read: "read files",
      zip: "make a ZIP",
      tidy: "organize a folder",
      draft: "draft",
      write: "build an app",
      send: "send outside",
      shell: "shell",
    },
  },
  menu: {
    hamburger: "Menu",
    language: "Language",
    openDock: "Open dock",
    unpin: "Peel off",
    pin: "Stick to monitor",
    pinAll: "Stick to top",
    talk: "Talk",
    policy: "Policy rules",
    grants: "Change grants",
    model: "AI model",
    tools: "Allowed tools",
    apps: "Allowed apps",
    hide: "Hide from desktop",
    showDesktop: "Show on desktop",
    site: "Site",
    connectPhone: "Connect phone",
  },
  companion: {
    connect: "Show a code",
    disconnect: "Disconnect",
    title: "Connect a phone",
    hint: "Open the QR on a phone on the same Wi-Fi. The left of this screen joins the right of the phone.",
    wifi: "Keep this Mac and the phone on the same Wi-Fi.",
    firewall: "If macOS asks to allow port 3000, choose Allow.",
    waiting: "Waiting for the phone",
    connected: "Connected",
    jumpToPhone: "Jump to phone",
    onPhone: "On the phone",
    empty: "Send a pet over from the PC",
    join: "Connect",
    joinHint: "Type the 6-digit code shown on the PC.",
    invalidCode: "That code is wrong or expired.",
    returnToPc: "Return to PC",
    leaveMessage: "Leave a note",
    messagePlaceholder: "Write a note",
    send: "Send",
    threadEmpty: "Send a note with the pet",
    notifyBody: (text) => `Note from the phone: ${text}`,
    fromPhone: "Phone",
    asleep: "Fell asleep",
    asleepHint: "Five round trips — time to rest. Gift a new pet from the PC.",
    trips: (n, max) => `${n}/${max} trips`,
    carryPhoto: "Carry one photo",
    replacePhoto: "Replace photo",
    photo: "Brought a photo",
    thinking: "Thinking…",
    codeLabel: "Code",
    noLan: "No Wi-Fi address found. Check the network.",
    codePlaceholder: "000000",
  },
  site: {
    nav: {
      features: "What it does",
      uses: "Uses",
      party: "Party",
      links: "Links",
      desk: "Desk",
      download: "Download",
      faq: "FAQ",
    },
    search: {
      label: "Search links",
      placeholder: "just enough, desk, research, permission…",
      submit: "Search",
      empty: "No links match that yet.",
      all: "All",
      count: (n) => `${n}`,
    },
    category: {
      product: "Product",
      party: "Party",
      docs: "Docs",
      source: "Source",
    },
    hero: {
      badge: "Stickable AI agents",
      title: "Ghost Companion, stuck on the desk",
      subtitle: "Research only, drafts only, this folder only — plus Obake.",
      lead: "Research only, drafts only, this folder only. You can see how far they’re allowed, so you don’t have to hand over extra.",
      permitHint: "On the desk, so you can manage the tasks.",
      ctaDesk: "Open the desk",
      ctaDownload: "Download",
      ctaLinks: "Search links",
      whyPets: "Why pets?",
      trustScope: "Scope first",
      trustAllow: "Confirm before it leaves",
    },
    problem: {
      label: "BEFORE",
      title: "Before it comes to this",
      items: [
        {
          title: "I want to try AI agents, but they’re scary and I don’t really get them",
          text: "Handing over access you can’t see still feels unsafe. It’s all-or-nothing, or nothing at all.",
        },
        {
          title: "They’re working somewhere I never intended — time wasted",
          text: "Folders and scope stay invisible. They touch places you didn’t ask for.",
        },
        {
          title: "I can’t tell which files changed",
          text: "The edits hide in a log. You can’t follow what moved.",
        },
      ],
    },
    features: {
      label: "FEATURES",
      title: "What Petassist is for",
      desc: "Put the work on the desk and manage it there. Research only, drafts only, this folder only. Hand over only what’s needed.",
      items: [
        {
          num: "01",
          title: "Stuck on the desk",
          text: "Drag from the pocket onto the monitor. Snap to the top edge. One pet, one always-on-top note.",
        },
        {
          num: "02",
          title: "Stickable AI agents",
          text: "Not so you’ll feel safer. So the work sits where you can manage it — who’s doing what, on the desk.",
        },
        {
          num: "03",
          title: "Only as much as they need",
          text: "Research only, drafts only, this folder only. Hand over only what’s needed for the job.",
        },
      ],
    },
    uses: {
      label: "EXAMPLES",
      title: "For example, you can use it like this",
      hint: "You can freely change permissions and the inference model to match the job. For example…",
      items: [
        {
          title: "Research only",
          text: "Search and look things up. They can check folders and what’s on the PC, but they don’t change anything.",
          stamp: "A sharp inspector",
        },
        {
          title: "Drafts only",
          text: "Write replies and announcements, then wait right before the send button.",
          stamp: "A writer you can count on",
        },
        {
          title: "Build tools",
          text: "Build apps and sites inside the folder you granted. They don’t enter places you didn’t ask for.",
          stamp: "A creative maker",
        },
      ],
    },
    party: {
      label: "PARTY",
      title: "You can freely change permissions and the inference model to match the job.",
      hint: "For example…",
      live: "Live today",
    },
    steps: {
      label: "HOW",
      title: "How the desk works",
      items: [
        {
          title: "Open the pocket",
          text: "Open the desk. Pets you can stick line up.",
        },
        {
          title: "Stick them on the monitor",
          text: "Drag and drop. Near the top edge they snap like sticky notes.",
        },
        {
          title: "Hand over just enough",
          text: "They work with just enough permission. Outbound jobs wait on Allow.",
        },
      ],
    },
    links: {
      label: "LINKS",
      title: "Search the links",
      hint: "GitHub, the desk, the field report, example uses. Type to filter.",
      pageTitle: "Links",
      pageLead:
        "Pages and outbound links for Petassist. Search here — and search engines can reach this list too.",
    },
    faq: {
      label: "FAQ",
      title: "Questions",
      items: [
        {
          q: "Why stick them on the desk?",
          a: "Not to make you feel less afraid. So the work sits where you can manage it. Who’s on what job, and how much permission they have, sits next to the pet you stuck there.",
        },
        {
          q: "Do I have to hand over everything to use them?",
          a: "No. Hand over only as much as they need. Research, draft, or send — the smallest license that can do it goes. They don’t work in folders you didn’t grant.",
        },
        {
          q: "Will they touch folders I never intended?",
          a: "They stay inside the range you granted. Permission isn’t buried in settings — it sits next to the pet on the desk, so you can manage that job there.",
        },
        {
          q: "Can I tell which files changed?",
          a: "The work stays on the desk, so you follow who, where, and what from there. You manage it as a task, not by digging through a log.",
        },
        {
          q: "Will they email or post to Slack on their own?",
          a: "No. Outbound work waits until you Allow. If you only need a draft, you hand it to a pet that cannot send.",
        },
        {
          q: "How do I start?",
          a: "Download the Windows, Mac, or Linux ZIP from this site, or open the desk. Stick a pet from the pocket onto the monitor. Write the job and send it — the one with just enough permission goes.",
        },
      ],
    },
    footer: {
      tagline: "Put the work on the desk and manage it. Research only, drafts only, this folder only.",
      github: "GitHub",
      report: "Field report",
      credit: "Animal icons: Yu Iwase",
    },
    rule: {
      line: "ONE PET   ONE JOB   JUST ENOUGH",
      note: "The rule that keeps the desk calm.",
    },
    pipe: {
      label: "THE PIPE",
      pocket: "Pocket window",
      pocketHint: "Sticky agents",
      desk: "The desk",
      deskHint: "Where the tasks live",
      forge: "TrueForge",
      forgeHint: "A scoped work loop",
      model: "The model",
      modelHint: "Right brain, right job",
      foot: "Built at a hackathon so the work sits on the desk — a place you can manage it.",
    },
    closing: {
      tape: "WAITING AT THE THRESHOLD",
      wait: "still waiting",
      title: "Hand over just enough. Stick it on the desk.",
      lead: "Research only. Drafts only. This folder only. Put the work on the desk so you can manage it. Hand over only what’s needed.",
    },
    download: {
      kicker: "DOWNLOAD",
      title: "Get the ZIP. Stick it on the desk.",
      lead: "A ZIP for Windows, Mac, and Linux. Unzip, open the pocket, and pin pets on the monitor. Permissions stay just enough.",
      windows: "Windows",
      windowsHint: "Unzip and open Petassist.exe. If SmartScreen appears, choose More info, then Run anyway.",
      mac: "Mac (Apple Silicon)",
      macHint: "Unzip and open Petassist.app. Unsigned: first launch is Control-click, then Open.",
      linux: "Linux",
      linuxHint: "Unzip and run the executable.",
      thisDevice: "This computer",
      cta: "Download ZIP",
      soon: "The latest file is still being prepared. Check GitHub Releases in a moment.",
      note: "Agent work runs on this computer. Jobs that need TrueForge still start that harness locally.",
      source: "Source is on",
      releases: "All releases",
    },
  },
  gate: {
    policyHeading: "AI Gateway · policy",
    policyHint: "How this pet should work. e.g. finish quickly, or take time and be careful.",
    policyPlaceholder: "Finish as soon as you can.",
    save: "Remember",
    modelHeading: "LLM Gateway · model",
    modelHint: "Pick Gemini, OpenAI, or another model to match the job.",
    imageHeading: "Image model",
    imageHint: "Only models whose API key is present.",
    imageNone: "No image API key yet.",
    toolsHeading: "MCP Gateway · tools",
    toolsHint: "Unchecked tools cannot be called here.",
    appsHeading: "Apps they may open",
    appsHint: "Only checked apps can be opened with open_app.",
    ai: "AI Gateway",
    llm: "LLM Gateway",
    mcp: "MCP Gateway",
  },
  busy: {
    title: "This might get heavy",
    pinAll: "Opening lots of windows at once can slow this Mac down.",
    activate: "Running many jobs at once can slow this Mac down.",
    continue: "Continue",
    cancel: "Cancel",
  },
  selected: {
    license: "License",
    gauge: "Gauge color",
    can: "Can",
    cannot: "Cannot",
    live: "Live",
    stop: "Stop",
    fail: "Fail",
    speak: "Talk",
  },
  cap: {
    talk: "Talk",
    research: "Look things up (won’t change files)",
    draft: "Write a draft, then stop before sending",
    readFolder: "Read inside folders you picked",
    diskFullRead: "Read files on this Mac",
    writeFiles: "Write files inside folders you picked",
    zipFiles: "Make a ZIP inside folders you picked",
    tidyFolders: "Sort files by type inside folders you picked",
    makeOffice: "Make PDFs, images, and slides",
    makeApps: "Build sites and apps inside folders you picked",
    shellFolder: "Run programs only inside folders you picked",
    shellFull: "Run commands on this Mac",
    sendAfterAllow: "Won’t send mail or chat until you press Send",
    generateImage: "Draw a picture in the chat",
    makeSheet: "Make a spreadsheet on the canvas",
    mailWatch: "Tell you about new mail and draft a reply. Sending waits for you",
    seen: "On the desk (visible)",
    openApps: (names) => `Open apps (${names})`,
    noSend: "Cannot send outside (drafts only)",
    noWrite: "Cannot write files",
    noDisk: "Cannot touch folders on this Mac",
    noShell: "Cannot run programs or commands",
    noOutside: "Can’t see outside the folders you picked unless you say so each time",
    noElevate: "Cannot raise own permissions",
    notLive: "No LLM on this slot today",
    noApps: "Cannot open apps",
    noResearch: "Cannot research",
  },
  grants: {
    heading: "This Mac",
    readOnly: "Read only",
    workspace: "This folder",
    fullAccess: "This whole Mac",
    addFolder: "Grant a folder",
    pastePath: "Paste a path",
    pathPlaceholder: "/Users/…",
    remove: "Remove",
    fullTitle: "Look at this Mac?",
    fullBody:
      "Looking outside the folders you already picked needs your OK each time. Mail and posts still wait until you press the button.",
    confirm: "Allow",
    cancel: "Cancel",
  },
  footer: "",
  log: {
    ready: "Welcome back!",
    incoming: (body) => `Unknown sender: ${body}`,
    catStart:
      "cat: inspect only. Can look at folders, does not change files.",
    bunnyStart: "bunny: drafts only. Waits right before send.",
    dogStart: "dog: organizes and builds inside the folder you picked. Won’t send until you press the button.",
    allow: (name, detail) => `${name}: posted after Send → ${detail}`,
    deny: (name) => `${name}: did not post (trainer denied)`,
    failAlert: (name) => `${name}: reported a problem in the bubble`,
    error: (message) => `Agent: ${message}`,
    instructed: (name, text) => `${name} ← ${text}`,
    dispatched: (name, text) => `Sent to ${name}: ${text}`,
    granted: (name, folder) => `${name}: granted folder → ${folder}`,
    harness: (kind, detail) => {
      const label =
        kind === "sandbox"
          ? "sandbox started"
          : kind === "subagent"
            ? "subagent"
            : kind === "oauth"
              ? "MCP OAuth needed"
              : "MCP connected";
      return detail ? `TrueForge: ${label} (${detail})` : `TrueForge: ${label}`;
    },
  },
  status: {
    idle: "Live",
    working: "Working",
    need_approval: "Needs you",
    stopped: "Stopped",
    failed: "Failed",
    done: "Done",
    empty: "Empty",
  },
  tier: {
    L0: "observe only",
    L1: "practice",
    L2: "draft",
    L3: "write + approval",
  },
  pets: {
    ghost: {
      name: "ghost",
      role: "companion",
      bubbles: {
        idle: [],
        working: [],
        need_approval: [],
        stopped: [],
        failed: [],
        done: [],
        empty: [],
      },
    },
    cat: {
      name: "cat",
      role: "desk",
      bubbles: {
        idle: ["Watching.", "Leave it to me."],
        working: ["On it…", "One moment."],
        need_approval: ["OK to send this outside?", "Waiting on send."],
        stopped: ["Paused."],
        failed: ["That didn't work…"],
        done: [],
        empty: [],
      },
    },
    penguin: {
      name: "penguin",
      role: "desk",
      bubbles: {
        ...quietEn,
        idle: ["I love the sandbox.", "Waddling on standby."],
        working: ["Focusing…", "Working."],
        need_approval: ["OK to send this outside?", "Waiting on send."],
        stopped: ["Not running today."],
      },
    },
    bunny: {
      name: "bunny",
      role: "desk",
      bubbles: {
        idle: ["Drafts are my job.", "I wait right before send."],
        working: ["Writing a draft…", "One moment."],
        need_approval: ["OK to send this outside?", "Waiting on send."],
        stopped: ["Paused."],
        failed: ["Couldn't finish that."],
        done: [],
        empty: [],
      },
    },
    dog: {
      name: "dog",
      role: "desk",
      bubbles: {
        idle: ["Trotting on standby.", "I build inside the folder."],
        working: ["Getting ready…", "Working."],
        need_approval: ["OK to send outside?", "Trainer!"],
        stopped: ["Paused."],
        failed: ["Couldn't send…", "Post missed."],
        done: [],
        empty: [],
      },
    },
    chick: {
      name: "chick",
      role: "desk",
      bubbles: {
        ...quietEn,
        idle: ["Flapping on standby.", "Leave it to me."],
        working: ["Working.", "Flap flap…"],
        need_approval: ["OK to send this outside?", "Waiting on send."],
        stopped: ["Off duty today."],
      },
    },
    raccoondog: {
      name: "tanuki",
      role: "desk",
      bubbles: {
        ...quietEn,
        idle: ["Watching…", "Safety first."],
        working: ["Checking.", "On it."],
        need_approval: ["OK to send this outside?", "Did you read it?"],
        stopped: ["Paused."],
      },
    },
  },
  errors: {
    noRuntime:
      "The judged job is TrueForge only. Start npx @truefoundry/trueforge, then Settings: model, Daytona, search MCP, Slack MCP. OPENAI_API_KEY is the Finder overlay, not the filmed loop.",
    stopped: "This pet is stopped.",
    unknownPet: "That pet is not a live agent.",
    needsLocal:
      "I can’t see that place on this Mac yet. Pick a folder I’m allowed to look in?",
    needsHarness:
      "This job runs on TrueForge only. Start npx @truefoundry/trueforge, then Settings → Models and Sandbox providers (Daytona). The OpenAI fallback is not used.",
  },
};

export const MESSAGES: Record<Locale, Messages> = { ja, en };
