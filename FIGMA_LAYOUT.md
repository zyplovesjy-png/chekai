# 扯旋房间页面 - Figma 组件参考

## 页面概览
- 最大宽度: 480px (移动端竖屏)
- 背景: 深蓝绿色渐变 (#082f3a)
- 布局: 垂直 flex (顶部栏 → 游戏区 → 提示栏 → 底部栏)

---

## 组件树 (从上到下)

### 1. TableTopStrip (顶部导航栏)
- **CSS class**: `.table-top-strip`
- **布局**: 3列网格 (86px | 1fr | 86px)
- **背景**: #09243a
- **高度**: ~34px

#### 1.1 SpectatorEntry (观战席按钮)
- **CSS class**: `.top-nav-btn.spectator-entry`
- **文字**: "观战席" + 观众人数
- **颜色**: #ffea00 (黄色)
- **字号**: 14px

#### 1.2 TableTopCenter (中央区域)
- **CSS class**: `.table-top-center`
- **内容**: 游戏类型下拉框 (1摸3 / 5摸10 / 5摸20)
- **房主可见**: 是 (游戏未开始时)

#### 1.3 HistoryEntry (对局记录按钮)
- **CSS class**: `.top-nav-btn.history-entry`
- **文字**: "对局记录" + 局数
- **颜色**: #ffea00
- **字号**: 14px

---

### 2. GameArea (游戏主区域)
- **CSS class**: `.game-area`
- **布局**: absolute 定位的子元素
- **背景**: #083642
- **flex**: 1 (占据剩余空间)

#### 2.1 PixiTableLayer (Pixi动画层，可选)
- **CSS class**: `.pixi-table-layer`
- **定位**: absolute, inset:0
- **z-index**: 0

#### 2.2 TableFelt (桌面区域)
- **CSS class**: `.table-felt`
- **定位**: absolute, 全屏覆盖
- **z-index**: 1

##### 2.2.1 DeckPile (牌堆)
- **CSS class**: `.deck-pile`
- **定位**: absolute, top:25%, left:50%
- **尺寸**: 44px × 58px
- **外观**: 白色圆角矩形 + 橙色边框 (#ff7a3d)
- **内容**: "牌堆" 文字

##### 2.2.2 PotBadge (底池显示)
- **CSS class**: `.pot-badge`
- **定位**: absolute, top:48%, left:50%
- **外观**: 蓝色胶囊形 (#116987)
- **内容**: "底池 0"

##### 2.2.3 CurrentBetMarker (当前下注标记)
- **CSS class**: `.current-bet-marker`
- **定位**: absolute, top:72%
- **内容**: 圆圈 + 数字

##### 2.2.4 TableRoomInfo (房间信息)
- **CSS class**: `.table-room-info`
- **定位**: absolute, top:61%
- **内容**: 房间名 + 房号·局数

#### 2.3 PlayerSeat × 8 (八个座位)
- **CSS class**: `.seat-slot.seat-vpos-{0-7}`
- **定位**: absolute, 按位置环绕桌面
- **z-index**: 6

##### 座位位置:
| 位置 | top/left |
|------|----------|
| vpos-0 (上) | top:2%, left:50% |
| vpos-1 (右上) | top:17%, right:2px |
| vpos-2 (右中) | top:45%, right:2px |
| vpos-3 (右下) | top:72%, right:2px |
| vpos-4 (下/自己) | bottom:3%, left:50% |
| vpos-5 (左下) | top:72%, left:2px |
| vpos-6 (左中) | top:45%, left:2px |
| vpos-7 (左上) | top:17%, left:2px |

##### 每个座位包含:
- **Avatar** (头像): 圆角方形, 42px(他人)/58px(自己), 黄色边框
- **SeatName** (昵称): 8px, #ffea00
- **SeatScore** (分数): 8px, #ffea00
- **状态徽章**: 庄(红)、弃(灰)、离(灰)、敲(橙色燃烧动画)
- **SeatBetChip** (下注筹码): 头像下方, 显示下注数
- **ReadyBtn/ReadyMark** (准备按钮/标记): 游戏未开始时显示

#### 2.4 PublicCards (明牌区) × 最多8组
- **CSS class**: `.public-cards.public-cards-vpos-{0-7}`
- **定位**: absolute, 各座位旁边
- **内容**: 第3、4张明牌 (小卡片)
- **尺寸**: 22px × 31px 每张
- **排除自己**: 自己的明牌不在此显示

#### 2.5 MyHand (自己的手牌)
- **CSS class**: `.my-hand-area`
- **定位**: absolute, bottom:2px, left:50%
- **z-index**: 8
- **尺寸**: 每张牌 34px × 48px
- **操作时上移**: bottom:82px (action-open时)

#### 2.6 CompareBanner (比牌结果)
- **CSS class**: `.compare-banner`
- **定位**: absolute, 居中
- **z-index**: 10

#### 2.7 AnimatedLayer (动画层)
- 发牌动画
- 中央弹出消息

---

### 3. HintBar (提示栏)
- **CSS class**: `.hint-bar`
- **状态**: 当前设计已隐藏 (display:none)

---

### 4. TurnActionPanel (操作面板，浮动)
- **CSS class**: `.turn-action-panel`
- **定位**: absolute, bottom:38px, left:50%
- **尺寸**: min(350px, 100%-54px) × 148px
- **z-index**: 18
- **显示条件**: 轮到自己操作 或 配牌阶段

#### 4.1 下注操作模式 (betStarted=true)
- **左侧按钮组**: 敲(knock)、甩(fold)
- **中间滑块**: 返分/叫分调节 (垂直旋转滑块)
- **右侧按钮组**: 返(raise)、瞧(see)
- **按钮样式**: 44px圆形, 橙色渐变

#### 4.2 休叫模式 (betStarted=false)
- **左侧**: 休(rest)
- **中间滑块**: 叫分调节
- **右侧**: 叫(call)

#### 4.3 配牌模式 (phase=selecting)
- **三按钮**: 自动、确认、重选
- **高度**: 72px (较矮)

---

### 5. BottomBar (底部栏)
- **CSS class**: `.bottom-bar`
- **布局**: 3列网格 (36px | 1fr | 36px)
- **背景**: #09243a
- **高度**: ~38px

#### 5.1 MenuButton (菜单按钮)
- **CSS class**: `.bottom-btn.menu-btn`
- **尺寸**: 28px × 28px
- **图标**: ≡

#### 5.2 ActionButtons (操作按钮区)
- **CSS class**: `.action-buttons`
- **内容**: 根据状态显示不同按钮
  - 等待: "等待" 文字
  - 可开始: "开始对局" 按钮
  - 可准备: "准备" 按钮

#### 5.3 ChatButton (聊天按钮)
- **CSS class**: `.bottom-btn.chat-btn`
- **尺寸**: 28px × 28px
- **图标**: ...

---

### 6. 弹窗组件

#### 6.1 BuyInModal (买入弹窗)
- 遮罩层 + 白色卡片
- 标题: "买入积分"
- 4个单选选项: 100/200/300/500 分
- 确认/取消按钮

#### 6.2 MenuModal (菜单弹窗)
- 遮罩层 + 白色卡片
- 菜单项: 离开座位、解散房间、返回大厅

#### 6.3 SettlementModal (结算弹窗)
- 遮罩层 + 白色卡片
- 每行: 昵称 + 初始分 + 剩余分 + 变化量
- 返回大厅按钮

#### 6.4 HistoryPanel (历史对局面板)
- 右上角浮动面板
- 上一局/下一局切换
- 每个玩家: 昵称 + 4张牌(头尾分组) + 输赢

---

## 颜色规范
| 用途 | 颜色 |
|------|------|
| 主背景 | #082f3a |
| 次背景 | #09243a, #083642 |
| 主强调色 | #ffea00 (黄) |
| 次强调色 | #f27b36 (橙) |
| 蓝色按钮 | #116987 |
| 文字-亮 | #e8f7ff |
| 文字-暗 | rgba(35,132,161,0.76) |
| 边框-亮 | #d7f8ff |
| 边框-暗 | rgba(0,0,0,0.45) |

## 字号规范
| 用途 | 字号 |
|------|------|
| 座位昵称 | 8px |
| 座位分数 | 8px |
| 顶部按钮 | 14px |
| 底池数值 | 14px |
| 房间信息 | 13-14px |
| 操作按钮 | 13-14px |
| 滑块标签 | 9-11px |
