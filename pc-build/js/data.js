/*
 * PC組み立てチャレンジ  データ定義
 * ここを書き換えると、ペナルティの秒数・部品の説明・ヒントの文章などを調整できます。
 * 座標はすべて「作業台」全体を 横1200 × 縦720 とした値です。
 */
window.PCGAME = (function () {
  'use strict';

  // ペナルティ（秒）。記録タイム = 作業時間 + ペナルティ − ボーナス
  const CONFIG = {
    fail: 30,     // 電源を入れて正常に起動しなかった 1回あたり
    miss: 15,     // 間違った場所・合わない部品を取り付けようとした 1回あたり
    hint: 60,     // ヒントを見た 1回あたり
    hddBonus: 30  // HDDをケーブルまで正しく接続して完成させたときのボーナス
  };

  // 部品。type が同じ置き場所に取り付けられる。decoy があるものは「合わない部品」
  const PARTS = {
    mobo:     { name: 'マザーボード', spec: 'ATX・CPUソケット LGA1700・メモリ DDR5', type: 'mobo', cat: 'body', img: 'images/motherboard.svg', z: 2,
                desc: 'すべての部品をつなぐ基板。CPUの形とメモリの種類が決まっている。' },
    cpu_am5:  { name: 'CPU', spec: 'ソケット AM5・8コア', type: 'cpu', cat: 'body', thumb: 'images/cpu-am5.svg',
                decoy: 'CPUの裏側の形（ソケット）が合いません。このマザーボードは LGA1700 用です。' },
    cpu:      { name: 'CPU', spec: 'ソケット LGA1700・8コア・内蔵グラフィックスなし', type: 'cpu', cat: 'body', img: 'images/cpu.svg', z: 3,
                desc: '命令を実行する頭脳。このCPUは映像を作る機能を持っていない。' },
    cooler:   { name: 'CPUクーラー', spec: '空冷・ファン付き', type: 'cooler', cat: 'body', img: 'images/cooler.svg', z: 6,
                desc: 'CPUの熱を逃がす。CPUの上にかぶせて取り付ける。' },
    mem:      { name: 'メモリ', spec: 'DDR5・16GB', type: 'mem', cat: 'body', img: 'images/memory-top.svg', thumb: 'images/memory-ddr5.svg', count: 2, z: 4,
                desc: 'CPUが作業するときの机。2枚あると2つの通り道（デュアルチャネル）が使える。' },
    mem_ddr4: { name: 'メモリ', spec: 'DDR4・16GB', type: 'mem', cat: 'body', thumb: 'images/memory-ddr4.svg',
                decoy: '切り欠き（ノッチ）の位置が合わず、スロットに差し込めません。このマザーボードは DDR5 用です。' },
    ssd:      { name: 'M.2 SSD', spec: '1TB・OSインストール済み', type: 'ssd', cat: 'body', img: 'images/ssd-m2.svg', z: 4,
                desc: 'OSが入っている記憶装置。マザーボードに直接差し込む。' },
    hdd:      { name: 'HDD', spec: '3.5インチ・2TB・データ用（OSなし）', type: 'hdd', cat: 'body', img: 'images/hdd.svg', z: 2,
                desc: '大容量のデータ置き場。電源とデータの2本のケーブルが必要。' },
    gpu:      { name: 'グラフィックボード', spec: 'PCIe x16・補助電源8ピン', type: 'gpu', cat: 'body', img: 'images/gpu.svg', z: 7,
                desc: '映像を作る装置。消費電力が大きく、補助電源が必要。' },

    c24:      { name: '24ピン電源ケーブル', spec: 'マザーボードのメイン電源', type: 'c24', cat: 'cable', thumb: 'images/cable-24pin.svg', cable: true, color: '#eef0f2', w: 9, plug: '#f4f5f6' },
    c8:       { name: 'CPU補助電源ケーブル', spec: '8ピン（CPU用）', type: 'c8', cat: 'cable', thumb: 'images/cable-8pin.svg', cable: true, color: '#eef0f2', w: 6, plug: '#f4f5f6' },
    cpcie:    { name: 'PCIe補助電源ケーブル', spec: '8ピン（グラフィックボード用）', type: 'cpcie', cat: 'cable', thumb: 'images/cable-pcie.svg', cable: true, color: '#4b525b', w: 6, plug: '#22262b' },
    cfp:      { name: 'フロントパネルケーブル', spec: 'ケースの電源ボタン・LED', type: 'cfp', cat: 'cable', thumb: 'images/cable-frontpanel.svg', cable: true, color: '#8a6cf0', w: 3, plug: '#15181b' },
    csatap:   { name: 'SATA電源ケーブル', spec: 'HDD・SSD用の電源', type: 'csatap', cat: 'cable', thumb: 'images/cable-sata-power.svg', cable: true, color: '#f0c03e', w: 4, plug: '#15181b' },
    csatad:   { name: 'SATAデータケーブル', spec: 'HDD・SSDとマザーボードをつなぐ', type: 'csatad', cat: 'cable', thumb: 'images/cable-sata-data.svg', cable: true, color: '#d63a3a', w: 4, plug: '#15181b' },

    monitor:  { name: 'モニター', spec: '24インチ・HDMI入力', type: 'monitor', cat: 'periph', img: 'images/monitor.svg', z: 2 },
    hdmi:     { name: '映像ケーブル', spec: 'HDMI', type: 'hdmi', cat: 'periph', thumb: 'images/cable-hdmi.svg', cable: true, color: '#2b2f35', w: 6, plug: '#15181b' },
    keyboard: { name: 'キーボード', spec: 'USB接続', type: 'keyboard', cat: 'periph', img: 'images/keyboard.svg', z: 2 },
    mouse:    { name: 'マウス', spec: 'USB接続', type: 'mouse', cat: 'periph', img: 'images/mouse.svg', z: 2 }
  };

  const TRAY = {
    body:   ['mobo', 'cpu_am5', 'cpu', 'cooler', 'mem', 'mem_ddr4', 'ssd', 'hdd', 'gpu'],
    cable:  ['c24', 'c8', 'cpcie', 'cfp', 'csatap', 'csatad'],
    periph: ['monitor', 'hdmi', 'keyboard', 'mouse']
  };

  // 取り付け場所。r = [x, y, 幅, 高さ]、img = 部品を描く範囲、drop = 落とせる範囲、needs = 先に必要な取り付け場所
  const TARGETS = [
    { id: 'mobo',   accepts: 'mobo',   label: 'マザーボードの取り付け位置', r: [60, 40, 410, 512] },
    { id: 'cpu',    accepts: 'cpu',    label: 'CPUソケット', r: [200, 120, 90, 90], needs: ['mobo'] },
    { id: 'cooler', accepts: 'cooler', label: 'CPUクーラーの位置', r: [170, 90, 150, 150], needs: ['cpu'] },
    { id: 'mem1',   accepts: 'mem',    label: 'メモリスロット A1', r: [343, 68, 16, 264], needs: ['mobo'], ch: 'A' },
    { id: 'mem2',   accepts: 'mem',    label: 'メモリスロット A2', r: [363, 68, 16, 264], needs: ['mobo'], ch: 'A' },
    { id: 'mem3',   accepts: 'mem',    label: 'メモリスロット B1', r: [383, 68, 16, 264], needs: ['mobo'], ch: 'B' },
    { id: 'mem4',   accepts: 'mem',    label: 'メモリスロット B2', r: [403, 68, 16, 264], needs: ['mobo'], ch: 'B' },
    { id: 'm2',     accepts: 'ssd',    label: 'M.2スロット', r: [150, 296, 180, 22], needs: ['mobo'] },
    { id: 'pcie',   accepts: 'gpu',    label: 'PCIe x16スロット', r: [110, 360, 290, 14], img: [20, 338, 420, 114], drop: [100, 340, 310, 44], needs: ['mobo'] },
    { id: 'c24',    accepts: 'c24',    label: '24ピン電源コネクタ', r: [440, 200, 22, 90], needs: ['mobo'],
      path: 'M338 600 L505 600 L505 245 L462 245' },
    { id: 'c8',     accepts: 'c8',     label: 'CPU補助電源コネクタ', r: [126, 44, 50, 18], needs: ['mobo'],
      path: 'M338 592 L495 592 L495 22 L151 22 L151 44' },
    { id: 'cpcie',  accepts: 'cpcie',  label: 'グラフィックボードの補助電源', r: [380, 344, 40, 16], needs: ['pcie'],
      path: 'M338 584 L485 584 L485 334 L400 334 L400 344' },
    { id: 'fp',     accepts: 'cfp',    label: 'フロントパネル端子', r: [390, 526, 50, 16], needs: ['mobo'],
      path: 'M716 516 L600 516 L600 534 L440 534' },
    { id: 'hdd',    accepts: 'hdd',    label: '3.5インチベイ', r: [525, 578, 175, 106] },
    { id: 'satap',  accepts: 'csatap', label: 'HDDの電源端子', r: [512, 592, 14, 30], needs: ['hdd'],
      path: 'M338 610 L512 610' },
    { id: 'satad',  accepts: 'csatad', label: 'マザーボードのSATA端子', r: [445, 420, 20, 50], needs: ['mobo', 'hdd'],
      path: 'M465 440 L517 440 L517 650 L525 650', plug2: [523, 640, 10, 20] },
    { id: 'hdmi_mb',  accepts: 'hdmi', label: 'マザーボードの映像端子', r: [70, 186, 40, 30], needs: ['mobo'] },
    { id: 'hdmi_gpu', accepts: 'hdmi', label: 'グラフィックボードの映像端子', r: [16, 382, 30, 28], needs: ['pcie'] },
    { id: 'monitor',  accepts: 'monitor',  label: 'モニターを置く場所', r: [780, 30, 390, 310] },
    { id: 'kb',       accepts: 'keyboard', label: 'キーボードを置く場所', r: [790, 380, 310, 90] },
    { id: 'mouse',    accepts: 'mouse',    label: 'マウスを置く場所', r: [1120, 385, 50, 80] }
  ];

  // トラブルの種類。en = 画面に出る英語、hint = ヒントと解説
  const TROUBLES = {
    NO_PSU_SW:  { title: '電源ユニットのスイッチが切れている', en: '（画面表示なし）',
      hint: '電源ユニット背面のスイッチが「○」（OFF）のままです。「｜」（ON）に切り替えないと、コンセントからの電気がPCに入りません。' },
    NO_MOBO:    { title: 'マザーボードがない', en: '（画面表示なし）',
      hint: 'マザーボードが取り付けられていません。電源ボタンの信号を受け取る部品も、各部品に電気を配る部品もありません。' },
    NO_FP:      { title: '電源ボタンがつながっていない', en: '（画面表示なし）',
      hint: 'ケース前面の電源ボタンとマザーボードをつなぐ「フロントパネルケーブル」がありません。ボタンを押しても、その信号がマザーボードに届きません。' },
    NO_24:      { title: 'マザーボードに電気が来ていない', en: '（画面表示なし）',
      hint: 'マザーボードに電気を送る「24ピン電源ケーブル」がつながっていません。マザーボード全体が動けません。' },
    NO_CPU:     { title: 'CPUがない', en: 'No Signal',
      hint: 'CPUが取り付けられていません。命令を実行する装置がないので、起動の最初の段階で止まります。診断ランプ「CPU」が知らせています。「No Signal」は「映像の信号がない」という意味です。' },
    NO_8:       { title: 'CPUに電気が来ていない', en: 'No Signal',
      hint: 'CPUに電気を送る「CPU補助電源ケーブル（8ピン）」がつながっていません。CPUは電気をたくさん使うので、24ピンとは別に専用のケーブルが必要です。診断ランプ「CPU」が点いたままになります。' },
    NO_MEM:     { title: 'メモリがない', en: 'No Signal',
      hint: 'メモリがありません。CPUが作業するための場所がないので先に進めず、ビープ音と診断ランプ「DRAM」で知らせています。' },
    NO_GPU:     { title: '映像を作る装置がない', en: 'No Signal',
      hint: 'このCPUには内蔵グラフィックスがありません。映像を作る装置がないので、グラフィックボードが必要です。ビープ音と診断ランプ「VGA」で知らせています。' },
    GPU_PWR:    { title: 'グラフィックボードの電気が足りない', en: 'Please power down and connect the PCIe power cable(s) for this graphics card.',
      hint: 'グラフィックボードの「PCIe補助電源ケーブル」がつながっていません。消費電力が大きいので、スロットからの電気だけでは足りません。英文は「電源を切って、このグラフィックボードにPCIe電源ケーブルをつないでください」という意味です。' },
    NO_MONITOR: { title: 'モニターがない', en: '（確認できない）',
      hint: 'PCは動いているようですが、モニターがないので結果を確認できません。まずモニターを置きましょう。' },
    NO_CABLE:   { title: '映像ケーブルがない', en: 'Check Signal Cable',
      hint: 'モニターとPCをつなぐ映像ケーブルがありません。「Check Signal Cable」は「信号ケーブルを確認してください」という意味です。' },
    WRONG_PORT: { title: '映像ケーブルのつなぎ先が違う', en: 'No Signal',
      hint: '映像ケーブルがマザーボードの映像端子につながっています。このCPUには内蔵グラフィックスがないので、そこからは映像が出ません。グラフィックボードの端子につなぎ直しましょう。' },
    NO_COOLER:  { title: 'CPUが冷やされていない', en: 'CPU Fan Error! / CPU Over Temperature!',
      hint: 'CPUクーラーがありません。CPUは数秒で高温になり、壊れないように自動で電源が切れました。「CPU Fan Error!」は「CPUファンのエラー」、「CPU Over Temperature」は「CPUの温度が高すぎる」という意味です。' },
    NO_KB:      { title: 'キーボードがない', en: 'Keyboard error or no keyboard present',
      hint: 'キーボードがありません。英文は「キーボードのエラー、またはキーボードがありません」という意味です。「F1キーを押して」と言われても、押すキーボードがありません。' },
    NO_BOOT:    { title: 'OSが入った記憶装置がない', en: 'Reboot and Select proper Boot device',
      hint: 'OSが入った記憶装置（M.2 SSD）がありません。英文は「再起動して、正しい起動装置を選んでください」という意味です。HDDはデータ用でOSが入っていないので、HDDだけでは起動できません。' },
    NO_MOUSE:   { title: 'マウスがない', en: 'No pointing device detected.',
      hint: 'マウスがありません。英文は「ポインティングデバイス（マウスなど）が見つかりません」という意味です。OSは起動しましたが、操作ができません。' }
  };

  return { CONFIG, PARTS, TRAY, TARGETS, TROUBLES };
})();
