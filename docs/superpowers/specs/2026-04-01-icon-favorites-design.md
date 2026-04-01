# Icon Favorites (星标收藏) — Design Spec

> 简单星标收藏模式：hover 显示星标切换收藏，侧栏虚拟分组，数据随项目 (.icp) 持久化。

## 1. IconBlock 星标交互

星标位置：**左上角** `top: 4px; left: 4px`。批量 Checkbox 在右上角，物理分离无冲突。

| 状态 | 星标表现 |
|------|---------|
| 默认（未收藏） | 不显示星标 |
| Hover（未收藏） | 左上角出现淡灰空心星 (opacity 0.5)，hover 星标时 opacity 0.8 |
| 已收藏 | amber 实心星始终显示，不受 hover 控制 |
| 批量选择模式 | 星标隐藏，只保留 Checkbox — 避免误触 |

点击星标时 `e.stopPropagation()` 阻止冒泡，不触发图标选中。

使用 lucide-react `Star` 图标，`size={14}`。已收藏状态：`fill="#f59e0b" stroke="#f59e0b"`。

## 2. 侧栏 ResourceNav

在「全部」之后、「最近更新」之前插入「收藏」入口：

```
resource-all        → 全部
resource-favorite   → 收藏 (NEW)    ← lucide Star, amber 色
resource-recent     → 最近更新
resource-uncategorized → 未分组
resource-recycleBin → 回收站
```

虚拟分组 ID：`resource-favorite`。

计数：`getFavoriteCount()` — 在 `groupData` 变化时随其他计数一起重新计算。

## 3. 数据库 Schema + 迁移

### Schema 变更

`iconData` 表新增列：

```sql
ALTER TABLE iconData ADD COLUMN isFavorite INTEGER DEFAULT 0
```

- `0` = 未收藏，`1` = 已收藏
- `DEFAULT 0` 保证既有图标默认未收藏

### 迁移

在 `initDatabases()` migration 块中，沿用现有 `PRAGMA table_info` 检测模式：

```js
const hasFavCol = cols[0].values.some(row => row[1] === 'isFavorite');
if (!hasFavCol) {
  this.db.run(`ALTER TABLE ${iconData} ADD COLUMN isFavorite INTEGER DEFAULT 0`);
}
```

`initNewProject()` 的 `CREATE TABLE` 语句同步加入 `isFavorite INTEGER DEFAULT 0`。

### 向后兼容

- 旧版客户端打开新 .icp：sql.js 忽略不认识的列
- 新版打开旧 .icp：migration 自动加列，默认值 0

### 新增 CRUD 方法

| 方法 | SQL | 说明 |
|------|-----|------|
| `setIconFavorite(id, isFavorite)` | `UPDATE iconData SET isFavorite = ? WHERE id = ?` | 单个图标收藏/取消 |
| `setIconsFavorite(ids, isFavorite)` | `UPDATE iconData SET isFavorite = ? WHERE id IN (...)` | 批量收藏/取消 |
| `getFavoriteIcons()` | `SELECT * FROM iconData WHERE isFavorite = 1 AND iconGroup != 'resource-recycleBin'` | 获取收藏列表 |
| `getFavoriteCount()` | `SELECT COUNT(*) FROM iconData WHERE isFavorite = 1 AND iconGroup != 'resource-recycleBin'` | 收藏计数 |

所有写方法调用 `notifyMutation()`。

## 4. Store + BatchPanel

### Store

不在 store 中缓存 `favoriteIds`。收藏状态完全由数据库持有，通过现有 sync 机制刷新 UI：

- `setIconFavorite` / `setIconsFavorite` 调用后 → `notifyMutation()` → `syncLeft()` → ResourceNav 计数刷新 + IconGridLocal 列表刷新

### BatchPanel

操作按钮列表中新增「收藏」/「取消收藏」按钮，排在「复制到分组」和「删除」之间：

- 图标：lucide `Star` / `StarOff`
- 逻辑：检查选中图标是否**全部已收藏**
  - 不全是 → 按钮文案「收藏」，`db.setIconsFavorite(ids, 1)`
  - 全是 → 按钮文案「取消收藏」，`db.setIconsFavorite(ids, 0)`
- 操作后：`syncLeft()` + toast。**不清除选中**（收藏不改变图标位置）

## 5. IconGridLocal 集成

`resource-favorite` 分组的数据获取逻辑：

- 在 IconGridLocal 的数据源判断中，增加 `resource-favorite` case
- 调用 `db.getFavoriteIcons()` 获取图标列表
- 复用现有搜索、排序、虚拟滚动逻辑
- 不分 sticky group header（收藏是扁平列表）

## 6. 边界情况

| 场景 | 行为 |
|------|------|
| 删除已收藏图标 | 移入回收站，`isFavorite` 不变。收藏视图排除回收站。恢复后收藏还在 |
| 复制图标 (`duplicateIcons`) | 副本 `isFavorite = 0`，不继承收藏状态 |
| 导入图标 (`addIcons`) | 新图标默认 `isFavorite = 0` |
| 收藏视图下搜索/排序 | 复用现有逻辑 |
| 收藏数为 0 | 分组正常显示，计数 0，grid 显示空状态 |

## 7. 不做的事 (YAGNI)

- 不做收藏排序/自定义顺序
- 不做收藏分组/标签（与分组功能重叠）
- 不做快捷键收藏
- 不做收藏导出/筛选
- 不做 SideEditor 中的收藏按钮

## 8. 涉及文件

| 文件 | 变更 |
|------|------|
| `src/renderer/database/index.ts` | Schema migration + 4 个 CRUD 方法 |
| `src/renderer/components/IconBlock/index.tsx` | 星标 UI + hover 逻辑 |
| `src/renderer/components/SideMenu/ResourceNav.tsx` | 收藏入口 + 计数 |
| `src/renderer/components/BatchPanel/index.tsx` | 批量收藏/取消按钮 |
| `src/renderer/components/IconGridLocal/index.tsx` | `resource-favorite` 数据源 |
