import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Stack,
  Text,
  useHostTheme,
} from "cursor/canvas";

/**
 * 参考视口：iPhone 浏览器内容区 430 × 775
 * 顶栏 40 / 舞台 537 / HUD 198（来自现网 room.css）
 */

const VW = 430;
const VH = 775;
const TOP_H = 40;
const HUD_H = 198;
const STAGE_H = VH - TOP_H - HUD_H; // 537
const STAGE_Y = TOP_H;

const AVATAR = 38;
/** 水平贴边（左右头像外缘距屏边）；上下贴边见列规则 */
const EDGE_X = 16;
const TIMER_H = 14;
const CHIP_H = 16;
const INNER = 4; // 列内备用间距（与 SEAT_GAP 对齐现网 flex gap）
/** 现网 .seat-name：0.54rem × 1.15 + margin-bottom 2 ≈ 12 */
const NAME_H = 12;
/** 现网 .seat-slot flex gap */
const SEAT_GAP = 1;
/** 现网 .seat-slot 宽度 */
const SEAT_SLOT_W = 54;
const CARD_W = 34; // CARD_SLOT_PX
const CARD_H = 50;
const CARD_GAP = 2;
const CARD_ROW_GAP = 3;

/** 现网 felt → stage 百分比（tableLayout.ts） */
const FELT = { x: 0.1518, y: 0.07, w: 0.7, h: 0.8 };
const POT_STAGE = {
  x: FELT.x + 0.4974 * FELT.w, // ≈ 0.500
  y: FELT.y + 0.5017 * FELT.h, // ≈ 0.471
};
const DECK_STAGE = {
  x: FELT.x + 0.4974 * FELT.w,
  y: FELT.y + 0.3232 * FELT.h, // ≈ 0.329
};
/** tea-toast：相对 felt top:56% → stage */
const TOAST_STAGE_Y = FELT.y + 0.56 * FELT.h; // ≈ 0.518

/** msg-feed：height 3.9em，叠在 HUD 上方 bottom: calc(100% + 2px) */
const MSG_FEED_H = 3.9 * 16; // ≈ 62.4，按根字号 16px
const MSG_FEED_GAP = 2;
const MSG_FEED_SIDE = 10;
const MSG_FEED_BOTTOM = VH - HUD_H - MSG_FEED_GAP;
const MSG_FEED_TOP = MSG_FEED_BOTTOM - MSG_FEED_H;

/**
 * 座位整列（与 room.css 顺序一致）：倒计时 → 昵称 → 头像 → 簸簸
 * 左右：列顶 = 顶栏底；最下列簸簸底 = msg-feed 顶；两段列间距相等（px）
 */
const SIDE_COL_H =
  TIMER_H + SEAT_GAP + NAME_H + SEAT_GAP + AVATAR + SEAT_GAP + CHIP_H;
const SIDE_SPAN = MSG_FEED_TOP - STAGE_Y;
const SIDE_GAP_PX = (SIDE_SPAN - 3 * SIDE_COL_H) / 2;
const SIDE_COL_TOPS = [
  STAGE_Y,
  STAGE_Y + SIDE_COL_H + SIDE_GAP_PX,
  STAGE_Y + 2 * (SIDE_COL_H + SIDE_GAP_PX),
];
const SIDE_AVATAR_CYS = SIDE_COL_TOPS.map(
  (t) => t + TIMER_H + SEAT_GAP + NAME_H + SEAT_GAP + AVATAR / 2,
);

type ThemeColors = {
  accent: string;
  text: string;
  muted: string;
  stroke: string;
  elevated: string;
  fill: string;
};

function PublicCards({
  x,
  y,
  colors,
}: {
  x: number;
  y: number;
  colors: ThemeColors;
}) {
  // 4 张：2×2（比牌 split2 形态；中心为牌组中心）
  const faces = ["A♠", "K♠", "Q♥", "J♥"];
  const totalW = CARD_W * 2 + CARD_GAP;
  const totalH = CARD_H * 2 + CARD_ROW_GAP;
  const left = x - totalW / 2;
  const top = y - totalH / 2;
  return (
    <g>
      {faces.map((face, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const cx = left + col * (CARD_W + CARD_GAP);
        const cy = top + row * (CARD_H + CARD_ROW_GAP);
        return (
          <g key={i}>
            <rect
              x={cx}
              y={cy}
              width={CARD_W}
              height={CARD_H}
              rx={3}
              fill={colors.elevated}
              stroke={colors.stroke}
              strokeWidth={1}
            />
            <text
              x={cx + CARD_W / 2}
              y={cy + 20}
              textAnchor="middle"
              fontSize={10}
              fill={face.includes("♥") ? colors.accent : colors.text}
            >
              {face.slice(0, -1)}
            </text>
            <text
              x={cx + CARD_W / 2}
              y={cy + 36}
              textAnchor="middle"
              fontSize={12}
              fill={face.includes("♥") ? colors.accent : colors.text}
            >
              {face.slice(-1)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function BetPill({
  x,
  y,
  amount,
  colors,
}: {
  x: number;
  y: number;
  amount: number;
  colors: ThemeColors;
}) {
  const w = 36;
  const h = 16;
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={8}
        fill={colors.fill}
        stroke={colors.accent}
        strokeWidth={1}
      />
      <circle cx={x - 10} cy={y} r={5} fill={colors.accent} opacity={0.7} />
      <text x={x + 4} y={y + 3} textAnchor="middle" fontSize={9} fill={colors.accent}>
        {amount}
      </text>
    </g>
  );
}

function SeatStack({
  x,
  y,
  amount,
  colors,
}: {
  x: number;
  y: number;
  amount: number;
  colors: ThemeColors;
}) {
  return (
    <g>
      <rect
        x={x - 22}
        y={y - CHIP_H / 2}
        width={44}
        height={CHIP_H}
        rx={5}
        fill={colors.elevated}
        stroke={colors.stroke}
        strokeWidth={1}
      />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={9} fill={colors.muted}>
        {amount}
      </text>
    </g>
  );
}

function TimerBadge({
  x,
  y,
  sec,
  colors,
}: {
  x: number;
  y: number;
  sec: number;
  colors: ThemeColors;
}) {
  return (
    <g>
      <rect
        x={x - 16}
        y={y - TIMER_H / 2}
        width={32}
        height={TIMER_H}
        rx={4}
        fill={colors.elevated}
        stroke={colors.accent}
        strokeWidth={1}
      />
      <text x={x} y={y + 3} textAnchor="middle" fontSize={9} fill={colors.accent}>
        {sec}s
      </text>
    </g>
  );
}

/** 完整座位列：slot 包围盒 + 倒计时 + 昵称 + 头像 + 簸簸 */
function SeatColumn({
  cx,
  colTop,
  nickname,
  sec,
  chips,
  colors,
  floating,
  showSlotBox = true,
}: {
  cx: number;
  colTop: number;
  nickname: string;
  sec: number;
  chips: number;
  colors: ThemeColors;
  floating?: boolean;
  showSlotBox?: boolean;
}) {
  const timerCy = colTop + TIMER_H / 2;
  const nameTop = colTop + TIMER_H + SEAT_GAP;
  const nameCy = nameTop + NAME_H / 2;
  const avatarCy = nameTop + NAME_H + SEAT_GAP + AVATAR / 2;
  const chipCy = colTop + SIDE_COL_H - CHIP_H / 2;
  const stroke = floating ? colors.accent : colors.text;

  return (
    <g opacity={floating ? 0.9 : 1}>
      {showSlotBox && (
        <rect
          x={cx - SEAT_SLOT_W / 2}
          y={colTop}
          width={SEAT_SLOT_W}
          height={SIDE_COL_H}
          rx={6}
          fill="none"
          stroke={colors.accent}
          strokeWidth={1}
          strokeDasharray={floating ? "4 2" : "3 2"}
          opacity={0.45}
        />
      )}
      <TimerBadge x={cx} y={timerCy} sec={sec} colors={colors} />
      {/* 昵称区 */}
      <rect
        x={cx - 26}
        y={nameTop}
        width={52}
        height={NAME_H}
        rx={3}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={0.8}
        opacity={0.9}
      />
      <text x={cx} y={nameCy + 3} textAnchor="middle" fontSize={8} fill={colors.text}>
        {nickname}
      </text>
      <circle
        cx={cx}
        cy={avatarCy}
        r={AVATAR / 2}
        fill={colors.elevated}
        stroke={stroke}
        strokeWidth={1.4}
        strokeDasharray={floating ? "3 2" : undefined}
      />
      <SeatStack x={cx} y={chipCy} amount={chips} colors={colors} />
    </g>
  );
}

function IPhoneRoomWindow({
  mode = "seated",
}: {
  mode?: "seated" | "spectator";
}) {
  const theme = useHostTheme();
  const colors: ThemeColors = {
    accent: theme.accent.primary,
    text: theme.text.primary,
    muted: theme.text.secondary,
    stroke: theme.stroke.secondary,
    elevated: theme.bg.elevated,
    fill: theme.fill.tertiary,
  };
  const { accent, text, muted, stroke, elevated, fill } = colors;
  const clipId = mode === "seated" ? "iphoneWinClipSeated" : "iphoneWinClipSpectator";
  const footerLabel =
    mode === "seated"
      ? `已入座玩家 · ${VW}×${VH}`
      : `观战者（待调）· ${VW}×${VH}`;

  const stageBottom = STAGE_Y + STAGE_H;
  const midX = VW / 2;
  const midY = STAGE_Y + STAGE_H / 2;

  // 底池 / 牌堆：按 POT_ON_STAGE / DECK_ON_STAGE（相对 stage %）
  const potCx = VW * POT_STAGE.x;
  const potCy = STAGE_Y + STAGE_H * POT_STAGE.y;
  const deckCx = VW * DECK_STAGE.x;
  const deckCy = STAGE_Y + STAGE_H * DECK_STAGE.y;
  const toastCy = STAGE_Y + STAGE_H * TOAST_STAGE_Y;

  // msg-feed 叠在 HUD 上方（不占文档流）
  const msgFeedBottom = MSG_FEED_BOTTOM;
  const msgFeedTop = MSG_FEED_TOP;

  // 上中座：倒计时上沿紧贴顶栏下沿（整列含昵称）
  const topColTop = STAGE_Y;
  const topAvatarCy =
    topColTop + TIMER_H + SEAT_GAP + NAME_H + SEAT_GAP + AVATAR / 2;

  // 下中座（浮动）：整列簸簸下沿紧贴 HUD 上沿
  const bottomColBottom = stageBottom;
  const bottomColTop = bottomColBottom - SIDE_COL_H;
  const bottomAvatarCy =
    bottomColTop + TIMER_H + SEAT_GAP + NAME_H + SEAT_GAP + AVATAR / 2;

  // 左右：像素等距，见 SIDE_* 常量
  const sideCys = SIDE_AVATAR_CYS;
  const leftCx = EDGE_X + AVATAR / 2;
  const rightCx = VW - EDGE_X - AVATAR / 2;

  const gapBands = [
    {
      y0: SIDE_COL_TOPS[0] + SIDE_COL_H,
      y1: SIDE_COL_TOPS[1],
      label: `${SIDE_GAP_PX.toFixed(0)}px`,
    },
    {
      y0: SIDE_COL_TOPS[1] + SIDE_COL_H,
      y1: SIDE_COL_TOPS[2],
      label: `${SIDE_GAP_PX.toFixed(0)}px`,
    },
  ];

  /** 8 座：avatar 中心 + 朝桌心偏移画公牌/喊价 */
  type Seat = {
    id: string;
    ax: number;
    ay: number;
    side: "top" | "bottom" | "left" | "right";
    floating?: boolean;
  };
  const seats: Seat[] = [
    { id: "上", ax: midX, ay: topAvatarCy, side: "top" },
    { id: "右上", ax: rightCx, ay: sideCys[0], side: "right" },
    { id: "右", ax: rightCx, ay: sideCys[1], side: "right" },
    { id: "右下", ax: rightCx, ay: sideCys[2], side: "right" },
    { id: "下", ax: midX, ay: bottomAvatarCy, side: "bottom", floating: true },
    { id: "左下", ax: leftCx, ay: sideCys[2], side: "left" },
    { id: "左", ax: leftCx, ay: sideCys[1], side: "left" },
    { id: "左上", ax: leftCx, ay: sideCys[0], side: "left" },
  ];

  /** 公牌中心：头像 → 桌心方向 t≈0.42；喊价再靠里一点 */
  const towardCenter = (ax: number, ay: number, t: number) => ({
    x: ax + (midX - ax) * t,
    y: ay + (midY - ay) * t,
  });

  const pad = 18;
  const bezel = 12;
  const frameW = VW + pad * 2;
  const frameH = VH + pad * 2 + 24;
  const winX = pad;
  const winY = pad + 12;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${frameW} ${frameH}`}
      style={{
        display: "block",
        maxWidth: 480,
        border: `1px solid ${stroke}`,
        borderRadius: 12,
        background: theme.bg.chrome,
      }}
    >
      <rect x={4} y={4} width={frameW - 8} height={frameH - 8} rx={36} fill={fill} stroke={stroke} strokeWidth={2} />
      <rect x={frameW / 2 - 28} y={14} width={56} height={6} rx={3} fill={stroke} opacity={0.5} />

      <rect x={winX} y={winY} width={VW} height={VH} rx={bezel} fill={theme.bg.editor} stroke={accent} strokeWidth={1.5} />

      <g transform={`translate(${winX}, ${winY})`}>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={VW} height={VH} rx={bezel} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          {/* 顶栏 */}
          <rect x={0} y={0} width={VW} height={TOP_H} fill={fill} />
          <text x={12} y={18} fontSize={13} fontWeight={700} fill={accent}>
            A3K9
          </text>
          <text x={52} y={17} fontSize={9} fill={muted}>
            第1局 · 28:00
          </text>
          <text x={52} y={30} fontSize={8} fill={muted}>
            下注中
          </text>
          <rect x={VW - 78} y={6} width={28} height={28} rx={8} fill={elevated} stroke={stroke} strokeWidth={1} />
          <rect x={VW - 44} y={6} width={28} height={28} rx={8} fill={elevated} stroke={stroke} strokeWidth={1} />

          {/* 舞台底 */}
          <rect x={0} y={STAGE_Y} width={VW} height={STAGE_H} fill={fill} opacity={0.18} />

          {/* 左右座列间距（px） */}
          {gapBands.map((b, i) => (
            <rect key={`gb-${i}`} x={0} y={b.y0} width={10} height={b.y1 - b.y0} fill={accent} opacity={0.12} />
          ))}
          {gapBands.map((b, i) => (
            <text key={`gl-${i}`} x={1} y={(b.y0 + b.y1) / 2 + 3} fontSize={7} fill={accent}>
              {b.label}
            </text>
          ))}

          {/* —— 牌堆（DECK_ON_STAGE） —— */}
          <g>
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={`deck-${i}`}
                x={deckCx - 18 + i * 2}
                y={deckCy - 26 + i}
                width={28}
                height={40}
                rx={3}
                fill={elevated}
                stroke={i === 3 ? accent : stroke}
                strokeWidth={1}
                opacity={0.85 + i * 0.04}
              />
            ))}
            <text x={deckCx + 2} y={deckCy + 28} textAnchor="middle" fontSize={9} fill={muted}>
              牌堆
            </text>
          </g>

          {/* —— 桌心状态 toast（tea-toast，felt top:56%）—— */}
          <g>
            <rect
              x={midX - 70}
              y={toastCy - 11}
              width={140}
              height={22}
              rx={11}
              fill={fill}
              stroke={stroke}
              strokeWidth={1}
            />
            <text x={midX} y={toastCy + 4} textAnchor="middle" fontSize={11} fill={text}>
              发牌中…
            </text>
            <text x={midX} y={toastCy + 22} textAnchor="middle" fontSize={8} fill={muted}>
              tea-toast（状态）
            </text>
          </g>

          {/* —— 底池（POT_ON_STAGE ≈ stage 50% × 47.1%） —— */}
          <g>
            <circle cx={potCx - 6} cy={potCy - 10} r={7} fill={accent} opacity={0.45} />
            <circle cx={potCx + 4} cy={potCy - 13} r={7} fill={accent} opacity={0.65} />
            <circle cx={potCx + 8} cy={potCy - 5} r={6} fill={accent} opacity={0.4} />
            <rect
              x={potCx - 28}
              y={potCy + 4}
              width={56}
              height={18}
              rx={9}
              fill={elevated}
              stroke={accent}
              strokeWidth={1}
            />
            <text x={potCx} y={potCy + 16} textAnchor="middle" fontSize={11} fill={text}>
              底池 40
            </text>
            <text x={potCx + 40} y={potCy} fontSize={8} fill={accent}>
              code位
            </text>
          </g>

          {/* —— 各座：公牌 + 喊价（靠桌心） —— */}
          {seats.map((s, idx) => {
            const cards = towardCenter(s.ax, s.ay, 0.4);
            const bet = towardCenter(s.ax, s.ay, 0.55);
            return (
              <g key={`table-${s.id}`} opacity={s.floating ? 0.75 : 1}>
                <PublicCards x={cards.x} y={cards.y} colors={colors} />
                <BetPill x={bet.x} y={bet.y} amount={10 + idx * 5} colors={colors} />
              </g>
            );
          })}

          {/* —— 上中座：倒计时 → 昵称 → 头像 → 簸簸 —— */}
          <SeatColumn
            cx={midX}
            colTop={topColTop}
            nickname="玩家上"
            sec={12}
            chips={100}
            colors={colors}
          />

          {/* —— 下中座浮动 —— */}
          <g>
            <SeatColumn
              cx={midX}
              colTop={bottomColTop}
              nickname="玩家下"
              sec={8}
              chips={80}
              colors={colors}
              floating
            />
            <text x={midX + 40} y={bottomAvatarCy + 4} fontSize={8} fill={accent}>
              浮动
            </text>
          </g>

          {/* —— 左右六座 —— */}
          {(
            [
              { id: "右上", ax: rightCx, row: 0, nick: "右上哥" },
              { id: "右", ax: rightCx, row: 1, nick: "右座" },
              { id: "右下", ax: rightCx, row: 2, nick: "右下姐" },
              { id: "左下", ax: leftCx, row: 2, nick: "左下" },
              { id: "左", ax: leftCx, row: 1, nick: "左座" },
              { id: "左上", ax: leftCx, row: 0, nick: "左上" },
            ] as const
          ).map((s) => (
            <g key={s.id}>
              <SeatColumn
                cx={s.ax}
                colTop={SIDE_COL_TOPS[s.row]}
                nickname={s.nick}
                sec={15}
                chips={100}
                colors={colors}
              />
            </g>
          ))}

          {/* —— HUD 上方 msg-feed（5 条，绝对定位叠在舞台底部） —— */}
          <g>
            <rect
              x={MSG_FEED_SIDE}
              y={msgFeedTop}
              width={VW - MSG_FEED_SIDE * 2}
              height={MSG_FEED_H}
              rx={6}
              fill={accent}
              opacity={0.12}
              stroke={accent}
              strokeWidth={1.2}
              strokeDasharray="4 2"
            />
            <text x={MSG_FEED_SIDE + 4} y={msgFeedTop - 4} fontSize={8} fill={accent}>
              msg-feed · 高 {MSG_FEED_H.toFixed(0)}px · 右下筹码底与此顶边紧贴
            </text>
            {[
              "乙 跟 20",
              "丙 返 40",
              "丁 丢",
              "甲 叫 20",
              "轮次 · 第2轮下注",
            ].map((msg, i) => {
              const lineH = MSG_FEED_H / 5;
              const y = msgFeedTop + i * lineH + lineH * 0.72;
              return (
                <g key={msg}>
                  <rect
                    x={VW - MSG_FEED_SIDE - 130}
                    y={msgFeedTop + i * lineH + 2}
                    width={120}
                    height={lineH - 3}
                    rx={4}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={0.8}
                    opacity={0.85}
                  />
                  <text
                    x={VW - MSG_FEED_SIDE - 10}
                    y={y}
                    textAnchor="end"
                    fontSize={8}
                    fill={i === 4 ? accent : muted}
                  >
                    {msg}
                  </text>
                </g>
              );
            })}
          </g>

          {/* HUD */}
          <rect x={0} y={VH - HUD_H} width={VW} height={HUD_H} fill={fill} />
          <line x1={0} y1={VH - HUD_H} x2={VW} y2={VH - HUD_H} stroke={stroke} strokeWidth={1} />
          {(() => {
            let y = VH - HUD_H + 2;
            const rows: { h: number; label: string }[] = [
              { h: 22, label: "self-timer 22" },
              { h: 36, label: "self-row ~36" },
              { h: 70, label: "my-hand 70" },
              { h: 44, label: "action-bar 44" },
            ];
            return rows.map((r) => {
              const el = (
                <g key={r.label}>
                  <rect
                    x={8}
                    y={y}
                    width={VW - 16}
                    height={r.h}
                    rx={6}
                    fill={elevated}
                    stroke={stroke}
                    strokeWidth={1}
                  />
                  <text x={16} y={y + r.h / 2 + 4} fontSize={10} fill={muted}>
                    {r.label}
                  </text>
                </g>
              );
              y += r.h + 4;
              return el;
            });
          })()}
        </g>
      </g>

      <text x={frameW / 2} y={frameH - 6} textAnchor="middle" fontSize={10} fill={muted}>
        {footerLabel}
      </text>
    </svg>
  );
}

export default function IPhone430LayoutSpec() {
  return (
    <Stack gap={28} style={{ padding: 20, maxWidth: 1100 }}>
      <Stack gap={6}>
        <H1>参考窗 430×775 · 布局草案</H1>
        <Text tone="secondary">
          同一文件两份拷贝：上方 = 已入座参与玩家；下方 = 观战者（稍后单独调）。座位整列 = 倒计时 → 昵称 → 头像 → 簸簸。
        </Text>
      </Stack>

      <Callout tone="info" title="两份布局">
        当前两份画面相同，仅标题区分角色。请先锁定上方「已入座」规则；下方留给观战者差异（如下中座是否显示、HUD 是否换观战栏等）。
      </Callout>

      {/* —— ① 已入座玩家 —— */}
      <Stack gap={12}>
        <H2>① 已入座 · 参与游戏</H2>
        <Grid columns="1.15fr 0.85fr" gap={16}>
          <Card>
            <CardHeader>已入座玩家窗</CardHeader>
            <CardBody>
              <IPhoneRoomWindow mode="seated" />
            </CardBody>
          </Card>

          <Stack gap={12}>
            <Card>
              <CardHeader>
                <H3>尺寸（px）</H3>
              </CardHeader>
              <CardBody>
                <Stack gap={6}>
                  <Text>窗　430×775</Text>
                  <Text>顶栏 / 舞台 / HUD　40 / 537 / 198</Text>
                  <Text>倒计时　14　昵称区　{NAME_H}　头像　38　簸簸　16</Text>
                  <Text>seat-slot 宽　{SEAT_SLOT_W}</Text>
                  <Text>左右整列高　{SIDE_COL_H}</Text>
                  <Text>左右列间距　{SIDE_GAP_PX.toFixed(1)}px</Text>
                  <Text>EDGE_X　{EDGE_X}</Text>
                  <Text>msg-feed　高 {MSG_FEED_H.toFixed(0)} · 顶 y={MSG_FEED_TOP.toFixed(0)}</Text>
                </Stack>
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <H3>竖直贴边</H3>
              </CardHeader>
              <CardBody>
                <Stack gap={6}>
                  <Text>上中：倒计时顶 = 顶栏底</Text>
                  <Text>下中：簸簸底 = HUD 顶（浮动）</Text>
                  <Text>左右上：列顶 = 顶栏底</Text>
                  <Text>左右下：簸簸底 = msg-feed 顶</Text>
                </Stack>
              </CardBody>
            </Card>
          </Stack>
        </Grid>
      </Stack>

      <Divider />

      {/* —— ② 观战者（副本，待调） —— */}
      <Stack gap={12}>
        <H2>② 观战者（副本 · 待调）</H2>
        <Callout tone="warning" title="从此往下改观战差异">
          下方与上方目前像素一致。之后只动这一份：例如下中座常显、HUD 改为观战信息、是否隐藏操作栏等。
        </Callout>
        <Grid columns="1.15fr 0.85fr" gap={16}>
          <Card>
            <CardHeader>观战者窗</CardHeader>
            <CardBody>
              <IPhoneRoomWindow mode="spectator" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <H3>观战差异备忘</H3>
            </CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text tone="secondary">（待填）下中座是否始终显示</Text>
                <Text tone="secondary">（待填）HUD / 手牌 / 操作栏</Text>
                <Text tone="secondary">（待填）msg-feed 是否保留</Text>
              </Stack>
            </CardBody>
          </Card>
        </Grid>
      </Stack>

      <Divider />

      <H2>图例（共用）</H2>
      <Grid columns={2} gap={12}>
        <Text>虚线竖框 = seat-slot</Text>
        <Text>昵称灰底条 = .seat-name</Text>
        <Text>头像上 = 倒计时　下 = 簸簸</Text>
        <Text>2×2 牌 = 公牌　胶囊 = 喊价</Text>
        <Text>中上 = 牌堆　偏中 = 底池</Text>
        <Text>桌心条 = toast　HUD 顶框 = msg-feed</Text>
      </Grid>
    </Stack>
  );
}


